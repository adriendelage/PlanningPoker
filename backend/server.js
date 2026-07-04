const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// ── API REST (déclarée AVANT le fallback SPA) ────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: db.enabled() });
});

// Remarque : il n'y a volontairement aucun endpoint qui liste ou expose
// les sessions passées. Ces données (noms, hôtes, contenu des votes/notes)
// restent en base à des fins de fiabilité/diagnostic, mais ne sont jamais
// servies publiquement — le hub s'appuie uniquement sur l'historique local
// du navigateur de chaque utilisateur (voir frontend/src/localHistory.js).

// ── Servir le frontend buildé ─────────────────────────────────────────────────
const frontendDist = path.resolve(__dirname, "../frontend/dist");
app.use(express.static(frontendDist));

// SPA fallback — toutes les routes inconnues → index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let sessions = {};
let timers = {};

function broadcastState(id) {
  const s = sessions[id];
  if (!s) return;
  io.to(id).emit("state", {
    task: s.tasks[s.index] || "Terminé",
    participants: s.participants,
    revealed: s.revealed,
    timerSeconds: s.timerSeconds ?? null,
    history: s.history || []
  });
}

function startTimer(id, seconds) {
  const s = sessions[id];
  if (!s) return;
  if (timers[id]) clearInterval(timers[id]);
  s.timerSeconds = seconds;
  broadcastState(id);
  timers[id] = setInterval(() => {
    if (!sessions[id]) { clearInterval(timers[id]); return; }
    sessions[id].timerSeconds--;
    broadcastState(id);
    if (sessions[id].timerSeconds <= 0) {
      clearInterval(timers[id]);
      delete timers[id];
      sessions[id].revealed = true;
      sessions[id].timerSeconds = null;
      snapshotVotes(id); // ← snapshot pour le récap final
      broadcastState(id);
    }
  }, 1000);
}

function stopTimer(id) {
  if (timers[id]) { clearInterval(timers[id]); delete timers[id]; }
  if (sessions[id]) sessions[id].timerSeconds = null;
}

const CARDS = [0, 1, 3, 5, 8, 13, 21];
function closestCard(val) {
  return CARDS.reduce((a, b) => Math.abs(b - val) < Math.abs(a - val) ? b : a);
}

function snapshotVotes(id) {
  const s = sessions[id];
  if (!s) return;
  if (s.history.find(h => h.taskIndex === s.index)) return; // déjà snapshoté
  const votes = s.participants
    .map(p => p.vote)
    .filter(v => v != null && v !== "?" && !isNaN(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);
  const median = votes.length === 0 ? null
    : votes.length % 2 === 0
      ? closestCard((votes[votes.length / 2 - 1] + votes[votes.length / 2]) / 2)
      : votes[Math.floor(votes.length / 2)];
  const entry = {
    taskIndex: s.index,
    task: s.tasks[s.index],
    votes: s.participants.map(p => ({ name: p.name, vote: p.vote })),
    median
  };
  s.history.push(entry);

  // Persistance en base (asynchrone, sans bloquer le temps réel)
  db.saveResult({
    sessionId: id,
    taskIndex: entry.taskIndex,
    task: entry.task,
    median: entry.median,
    votes: entry.votes
  }).catch(e => console.error("DB saveResult:", e.message));
}

// ═══ Rétrospective ════════════════════════════════════════════════════════════
// Phases : writing (notes masquées aux autres) → voting (tout révélé, dot-voting)
//          → done (bilan trié par votes, persisté en base)

let retros = {};
let retroNoteSeq = 0;

function retroStateFor(r, viewerId) {
  const me = r.participants.find(p => p.id === viewerId);
  const myVotesUsed = r.notes.reduce(
    (acc, n) => acc + n.voters.filter(v => v === viewerId).length, 0
  );
  return {
    name: r.name,
    columns: r.columns,
    phase: r.phase,
    maxVotes: r.maxVotes,
    votesLeft: me ? r.maxVotes - myVotesUsed : 0,
    isHost: r.participants[0]?.id === viewerId,
    participants: r.participants.map(p => ({ name: p.name })),
    notes: r.notes.map(n => ({
      id: n.id,
      column: n.column,
      // Anonymat : l'auteur n'est jamais diffusé. Pendant l'écriture,
      // seul l'auteur voit le contenu de ses propres notes.
      text: (r.phase !== "writing" || n.authorId === viewerId) ? n.text : null,
      mine: n.authorId === viewerId,
      votes: n.voters.length,
      myVotes: n.voters.filter(v => v === viewerId).length
    }))
  };
}

function broadcastRetro(id) {
  const r = retros[id];
  if (!r) return;
  r.participants.forEach(p => {
    io.to(p.id).emit("retro:state", retroStateFor(r, p.id));
  });
}

function finishRetro(id) {
  const r = retros[id];
  if (!r) return;
  r.phase = "done";
  const snapshot = r.notes.map(n => ({
    column: n.column,
    text: n.text,
    votes: n.voters.length
  }));
  db.saveRetroNotes(id, snapshot).catch(e => console.error("DB saveRetroNotes:", e.message));
  db.finishSession(id).catch(e => console.error("DB finishSession:", e.message));

  // Nettoyage mémoire après 24h, comme pour le poker
  setTimeout(() => {
    if (retros[id]) {
      delete retros[id];
      console.log(`🧹 Rétro ${id} nettoyée`);
    }
  }, 24 * 60 * 60 * 1000);
}
// ═══════════════════════════════════════════════════════════════════════════════

// ═══ Daily Timer ═══════════════════════════════════════════════════════════════
// Phases : lobby (on attend l'équipe) → running (rotation des speakers) → done
// Chaque participant a un temps de parole ; le dépassement est compté.

let dailies = {};
let dailyTimers = {};

function dailyStateFor(d, viewerId) {
  return {
    name: d.name,
    phase: d.phase,
    secondsPerPerson: d.secondsPerPerson,
    currentIndex: d.currentIndex,
    remaining: d.remaining,
    isHost: d.participants[0]?.id === viewerId,
    participants: d.participants.map((p, i) => ({
      name: p.name,
      seconds: p.seconds,
      isMe: p.id === viewerId,
      done: d.phase === "running" ? i < d.currentIndex : d.phase === "done"
    }))
  };
}

function broadcastDaily(id) {
  const d = dailies[id];
  if (!d) return;
  d.participants.forEach(p => {
    io.to(p.id).emit("daily:state", dailyStateFor(d, p.id));
  });
}

function finishDaily(id) {
  const d = dailies[id];
  if (!d) return;
  if (dailyTimers[id]) { clearInterval(dailyTimers[id]); delete dailyTimers[id]; }
  d.phase = "done";
  const times = d.participants.map(p => ({ name: p.name, seconds: p.seconds }));
  db.saveDailyTimes(id, times).catch(e => console.error("DB saveDailyTimes:", e.message));
  db.finishSession(id).catch(e => console.error("DB finishSession:", e.message));
  setTimeout(() => {
    if (dailies[id]) { delete dailies[id]; console.log(`🧹 Daily ${id} nettoyé`); }
  }, 24 * 60 * 60 * 1000);
}

// ═══ Kanban ════════════════════════════════════════════════════════════════════
// Contrairement aux autres outils, la BASE est la source de vérité :
// le tableau survit aux redémarrages et se recharge à la demande.
// La mémoire ne sert que de cache pour le temps réel.

let kanbans = {};
let kanbanMemSeq = 0; // ids de secours en mode mémoire (sans DB)
const KANBAN_COLUMNS = ["À faire", "En cours", "Terminé"];

async function ensureKanban(id) {
  if (kanbans[id]) return kanbans[id];
  const board = await db.kanbanLoadBoard(id); // null si DB désactivée ou inconnu
  if (board) kanbans[id] = board;
  return kanbans[id] || null;
}

function broadcastKanban(id) {
  const k = kanbans[id];
  if (!k) return;
  io.to("kb:" + id).emit("kanban:state", { name: k.name, cards: k.cards });
}
// ═══════════════════════════════════════════════════════════════════════════════

// ═══ Vélocité ══════════════════════════════════════════════════════════════════
// Comme le Kanban : outil permanent, la BASE est la source de vérité.
// La mémoire ne sert que de cache pour le temps réel.

let velocities = {};

async function ensureVelocity(id) {
  if (velocities[id]) return velocities[id];
  const board = await db.velocityLoadBoard(id);
  if (board) velocities[id] = board;
  return velocities[id] || null;
}

function broadcastVelocity(id) {
  const v = velocities[id];
  if (!v) return;
  io.to("vel:" + id).emit("velocity:state", { name: v.name, sprints: v.sprints });
}

// ═══ OKR léger ═════════════════════════════════════════════════════════════════
// Même principe : outil permanent, base = source de vérité.

let okrs = {};

async function ensureOkr(id) {
  if (okrs[id]) return okrs[id];
  const board = await db.okrLoadBoard(id);
  if (board) okrs[id] = board;
  return okrs[id] || null;
}

function broadcastOkr(id) {
  const o = okrs[id];
  if (!o) return;
  io.to("okr:" + id).emit("okr:state", { name: o.name, objectives: o.objectives });
}
// ═══════════════════════════════════════════════════════════════════════════════

// ═══ Rétro-planning (Gantt) ═════════════════════════════════════════════════════
// Même principe que Kanban/Vélocité/OKR : outil permanent, base = source de
// vérité. Le calcul du chemin critique (CPM) est un calcul PUR à partir des
// tâches et dépendances — il est fait côté client (frontend/src/cpm.js),
// puisque c'est une fonction déterministe du même graphe pour tout le monde.
// Le serveur ne fait que stocker et diffuser les tâches/dépendances brutes.

let ganttBoards = {};

async function ensureGantt(id) {
  if (ganttBoards[id]) return ganttBoards[id];
  const board = await db.ganttLoadBoard(id);
  if (board) ganttBoards[id] = board;
  return ganttBoards[id] || null;
}

function broadcastGantt(id) {
  const g = ganttBoards[id];
  if (!g) return;
  io.to("gantt:" + id).emit("gantt:state", { name: g.name, tasks: g.tasks });
}
// ═══════════════════════════════════════════════════════════════════════════════

// ═══ Planificateur de capacité ═══════════════════════════════════════════════
// Même famille que Kanban/Vélocité/OKR/Gantt : outil permanent, base = source
// de vérité. Le calcul (moyenne de disponibilité × vélocité de référence)
// est fait ici, côté serveur, plutôt que côté client comme pour le CPM du
// Gantt — c'est une simple moyenne, pas un algorithme partagé qui mérite
// d'être isolé dans son propre module, et ça garantit que la valeur
// enregistrée en base est celle qui a été calculée au moment de l'ajout.

let capacityBoards = {};

async function ensureCapacity(id) {
  if (capacityBoards[id]) return capacityBoards[id];
  const board = await db.capacityLoadBoard(id);
  if (board) capacityBoards[id] = board;
  return capacityBoards[id] || null;
}

function broadcastCapacity(id) {
  const c = capacityBoards[id];
  if (!c) return;
  io.to("cap:" + id).emit("capacity:state", { name: c.name, entries: c.entries });
}

function computeSuggestedCapacity(refVelocity, members) {
  if (members.length === 0) return 0;
  const avgAvailability = members.reduce((sum, m) => sum + m.availability, 0) / members.length;
  return Math.round(refVelocity * (avgAvailability / 100));
}
// ═══════════════════════════════════════════════════════════════════════════════

// ═══ Sondage rapide ══════════════════════════════════════════════════════════
// Éphémère comme le Poker : sessions en mémoire, snapshot en base à la clôture.

let polls = {};

function broadcastPoll(id) {
  const p = polls[id];
  if (!p) return;
  const tally = p.options.map((opt, i) => ({
    text: opt,
    votes: Object.values(p.votes).filter(v => v === i).length,
  }));
  p.participants.forEach(pid => {
    io.to(pid).emit("poll:state", {
      question: p.question,
      options: tally,
      participants: p.participants.length,
      closed: p.closed,
      myVote: p.votes[pid] ?? null,
      isHost: p.participants[0] === pid,
    });
  });
}

// ═══ Objectif de sprint ══════════════════════════════════════════════════════
let goalBoards = {};
async function ensureGoal(id) {
  if (goalBoards[id]) return goalBoards[id];
  const board = await db.goalLoadBoard(id);
  if (board) goalBoards[id] = board;
  return goalBoards[id] || null;
}
function broadcastGoal(id) {
  const g = goalBoards[id];
  if (!g) return;
  io.to("goal:" + id).emit("goal:state", { name: g.name, entries: g.entries });
}

// ═══ Definition of Done ══════════════════════════════════════════════════════
let dodBoards = {};
async function ensureDod(id) {
  if (dodBoards[id]) return dodBoards[id];
  const board = await db.dodLoadBoard(id);
  if (board) dodBoards[id] = board;
  return dodBoards[id] || null;
}
function broadcastDod(id) {
  const d = dodBoards[id];
  if (!d) return;
  io.to("dod:" + id).emit("dod:state", { name: d.name, items: d.items });
}

// ═══ Journal de décisions ════════════════════════════════════════════════════
let decisionBoards = {};
async function ensureDecisions(id) {
  if (decisionBoards[id]) return decisionBoards[id];
  const board = await db.decisionLoadBoard(id);
  if (board) decisionBoards[id] = board;
  return decisionBoards[id] || null;
}
function broadcastDecisions(id) {
  const d = decisionBoards[id];
  if (!d) return;
  io.to("dec:" + id).emit("decisions:state", { name: d.name, decisions: d.decisions });
}

// ═══ Post-mortem d'incident ══════════════════════════════════════════════════
let postmortemBoards = {};
async function ensurePostmortem(id) {
  if (postmortemBoards[id]) return postmortemBoards[id];
  const board = await db.postmortemLoad(id);
  if (board) postmortemBoards[id] = board;
  return postmortemBoards[id] || null;
}
function broadcastPostmortem(id) {
  const p = postmortemBoards[id];
  if (!p) return;
  io.to("pm:" + id).emit("postmortem:state", p);
}
function savePostmortem(id) {
  const p = postmortemBoards[id];
  if (!p) return;
  db.postmortemSave(id, p).catch(e => console.error("DB postmortemSave:", e.message));
}

// ═══ Suivi de feature flags ══════════════════════════════════════════════════
let flagBoards = {};
async function ensureFlags(id) {
  if (flagBoards[id]) return flagBoards[id];
  const board = await db.flagLoadBoard(id);
  if (board) flagBoards[id] = board;
  return flagBoards[id] || null;
}
function broadcastFlags(id) {
  const f = flagBoards[id];
  if (!f) return;
  io.to("flags:" + id).emit("flags:state", { name: f.name, flags: f.flags });
}

// ═══ Pouls d'équipe ══════════════════════════════════════════════════════════
let pulseBoards = {};
async function ensurePulse(id) {
  if (pulseBoards[id]) return pulseBoards[id];
  const board = await db.pulseLoadBoard(id);
  if (board) pulseBoards[id] = board;
  return pulseBoards[id] || null;
}
function broadcastPulse(id) {
  const p = pulseBoards[id];
  if (!p) return;
  io.to("pulse:" + id).emit("pulse:state", { name: p.name, entries: p.entries });
}
// ═══════════════════════════════════════════════════════════════════════════════

io.on("connection", socket => {

  socket.on("session:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    const tasks = data.tasks.filter(t => t.trim());
    sessions[id] = {
      name: data.sessionName || null,
      tasks,
      index: 0,
      participants: [],
      revealed: false,
      timerSeconds: null,
      history: []  // [{task, votes, median}]
    };
    const hostName = data.hostName || "Hôte";
    sessions[id].participants.push({ id: socket.id, name: hostName, vote: null });
    socket.join(id);
    cb(id);
    broadcastState(id);

    db.createSession({
      id,
      name: data.sessionName,
      hostName,
      tool: "poker",
      taskCount: tasks.length
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("session:join", ({ id, name }) => {
    if (!sessions[id]) return;
    const exists = sessions[id].participants.find(p => p.id === socket.id);
    if (!exists) {
      sessions[id].participants.push({ id: socket.id, name, vote: null });
    }
    socket.join(id);
    broadcastState(id);
  });

  socket.on("poker:state", ({ id, isHost }) => {
    const s = sessions[id];
    if (!s) return;
    socket.join(id);
    if (isHost) {
      const host = s.participants[0];
      if (host && host.id !== socket.id) host.id = socket.id;
    }
    socket.emit("state", {
      task: s.tasks[s.index] || "Terminé",
      participants: s.participants,
      revealed: s.revealed,
      timerSeconds: s.timerSeconds ?? null,
      history: s.history || []
    });
  });

  socket.on("vote", ({ id, value }) => {
    const s = sessions[id];
    if (!s) return;
    const p = s.participants.find(x => x.id === socket.id);
    if (p) { p.vote = value; broadcastState(id); }
  });

  socket.on("reveal", ({ id }) => {
    if (!sessions[id]) return;
    stopTimer(id);
    sessions[id].revealed = true;
    snapshotVotes(id); // snapshot pour le récap final
    broadcastState(id);
  });

  socket.on("next", ({ id }) => {
    const s = sessions[id];
    if (!s) return;
    stopTimer(id);
    s.index++;
    s.revealed = false;
    s.timerSeconds = null;
    s.participants.forEach(p => p.vote = null);
    broadcastState(id);

    // Session terminée → marquage en base + nettoyage mémoire après 24h
    if (s.index >= s.tasks.length) {
      db.finishSession(id).catch(e => console.error("DB finishSession:", e.message));
      setTimeout(() => {
        if (sessions[id]) {
          stopTimer(id);
          delete sessions[id];
          console.log(`🧹 Session ${id} nettoyée`);
        }
      }, 24 * 60 * 60 * 1000); // 24 heures
    }
  });

  socket.on("timer:start", ({ id, seconds }) => {
    if (!sessions[id]) return;
    startTimer(id, seconds);
  });

  socket.on("timer:stop", ({ id }) => {
    if (!sessions[id]) return;
    stopTimer(id);
    broadcastState(id);
  });

  // ─── Événements Rétrospective ───────────────────────────────────────────────

  socket.on("retro:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    const columns = (data.columns || []).map(c => c.trim()).filter(Boolean);
    retros[id] = {
      name: data.sessionName || null,
      columns: columns.length ? columns : ["Start", "Stop", "Continue"],
      phase: "writing",
      maxVotes: Math.min(Math.max(parseInt(data.maxVotes) || 3, 1), 10),
      participants: [{ id: socket.id, name: data.hostName || "Hôte" }],
      notes: [] // {id, column, text, authorId, voters: [participantId,...]}
    };
    socket.join(id);
    cb(id);
    broadcastRetro(id);

    db.createSession({
      id,
      name: data.sessionName,
      hostName: data.hostName,
      tool: "retro",
      taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("retro:join", ({ id, name }) => {
    const r = retros[id];
    if (!r) return;
    if (!r.participants.find(p => p.id === socket.id)) {
      r.participants.push({ id: socket.id, name });
    }
    socket.join(id);
    broadcastRetro(id);
  });

  // Reconnexion / rafraîchissement (même mécanique que poker:state)
  socket.on("retro:state", ({ id, isHost }) => {
    const r = retros[id];
    if (!r) return socket.emit("retro:notfound");
    socket.join(id);
    if (isHost) {
      const host = r.participants[0];
      if (host && host.id !== socket.id) host.id = socket.id;
    }
    socket.emit("retro:state", retroStateFor(r, socket.id));
  });

  socket.on("retro:note:add", ({ id, column, text }) => {
    const r = retros[id];
    if (!r || r.phase !== "writing") return;
    if (!r.columns.includes(column)) return;
    const content = String(text || "").trim().slice(0, 500);
    if (!content) return;
    if (!r.participants.find(p => p.id === socket.id)) return;
    r.notes.push({
      id: "n" + (++retroNoteSeq),
      column,
      text: content,
      authorId: socket.id,
      voters: []
    });
    broadcastRetro(id);
  });

  socket.on("retro:note:delete", ({ id, noteId }) => {
    const r = retros[id];
    if (!r || r.phase === "done") return;
    const idx = r.notes.findIndex(n => n.id === noteId);
    if (idx === -1) return;
    const isAuthor = r.notes[idx].authorId === socket.id;
    const isHost = r.participants[0]?.id === socket.id;
    if (!isAuthor && !isHost) return;
    r.notes.splice(idx, 1);
    broadcastRetro(id);
  });

  socket.on("retro:vote", ({ id, noteId, delta }) => {
    const r = retros[id];
    if (!r || r.phase !== "voting") return;
    const me = r.participants.find(p => p.id === socket.id);
    const note = r.notes.find(n => n.id === noteId);
    if (!me || !note) return;
    if (delta > 0) {
      const used = r.notes.reduce(
        (acc, n) => acc + n.voters.filter(v => v === socket.id).length, 0
      );
      if (used >= r.maxVotes) return;
      note.voters.push(socket.id);
    } else {
      const i = note.voters.indexOf(socket.id);
      if (i !== -1) note.voters.splice(i, 1);
    }
    broadcastRetro(id);
  });

  // Transition de phase (hôte uniquement) : writing → voting → done
  socket.on("retro:phase", ({ id, phase }) => {
    const r = retros[id];
    if (!r) return;
    if (r.participants[0]?.id !== socket.id) return;
    if (phase === "voting" && r.phase === "writing") {
      r.phase = "voting";
      broadcastRetro(id);
    } else if (phase === "done" && r.phase === "voting") {
      finishRetro(id);
      broadcastRetro(id);
    }
  });

  // ─── Événements Daily Timer ─────────────────────────────────────────────────

  socket.on("daily:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    dailies[id] = {
      name: data.sessionName || null,
      secondsPerPerson: Math.min(Math.max(parseInt(data.secondsPerPerson) || 120, 30), 600),
      phase: "lobby",
      currentIndex: 0,
      remaining: 0,
      participants: [{ id: socket.id, name: data.hostName || "Hôte", seconds: 0 }]
    };
    socket.join(id);
    cb(id);
    broadcastDaily(id);

    db.createSession({
      id, name: data.sessionName, hostName: data.hostName,
      tool: "daily", taskCount: 1
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("daily:join", ({ id, name }) => {
    const d = dailies[id];
    if (!d || d.phase !== "lobby") return;
    if (!d.participants.find(p => p.id === socket.id)) {
      d.participants.push({ id: socket.id, name, seconds: 0 });
    }
    socket.join(id);
    broadcastDaily(id);
  });

  socket.on("daily:state", ({ id, isHost }) => {
    const d = dailies[id];
    if (!d) return socket.emit("daily:notfound");
    socket.join(id);
    if (isHost) {
      const host = d.participants[0];
      if (host && host.id !== socket.id) host.id = socket.id;
    }
    socket.emit("daily:state", dailyStateFor(d, socket.id));
  });

  socket.on("daily:start", ({ id }) => {
    const d = dailies[id];
    if (!d || d.phase !== "lobby") return;
    if (d.participants[0]?.id !== socket.id) return; // hôte uniquement
    d.phase = "running";
    d.currentIndex = 0;
    d.remaining = d.secondsPerPerson;
    broadcastDaily(id);
    dailyTimers[id] = setInterval(() => {
      const dd = dailies[id];
      if (!dd || dd.phase !== "running") { clearInterval(dailyTimers[id]); return; }
      dd.remaining--; // peut passer en négatif = dépassement
      const cur = dd.participants[dd.currentIndex];
      if (cur) cur.seconds++;
      broadcastDaily(id);
    }, 1000);
  });

  // Speaker suivant : autorisé pour l'hôte ou le speaker en cours
  socket.on("daily:next", ({ id }) => {
    const d = dailies[id];
    if (!d || d.phase !== "running") return;
    const isHost = d.participants[0]?.id === socket.id;
    const isCurrent = d.participants[d.currentIndex]?.id === socket.id;
    if (!isHost && !isCurrent) return;
    if (d.currentIndex >= d.participants.length - 1) {
      finishDaily(id);
    } else {
      d.currentIndex++;
      d.remaining = d.secondsPerPerson;
    }
    broadcastDaily(id);
  });

  // ─── Événements Kanban ──────────────────────────────────────────────────────

  socket.on("kanban:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    kanbans[id] = { name: data.name || null, cards: [] };
    socket.join("kb:" + id);
    cb(id);

    db.createSession({
      id, name: data.name, hostName: data.hostName,
      tool: "kanban", taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("kanban:open", async ({ id }) => {
    const k = await ensureKanban(id).catch(() => null);
    if (!k) return socket.emit("kanban:notfound");
    socket.join("kb:" + id);
    socket.emit("kanban:state", { name: k.name, cards: k.cards });
  });

  socket.on("kanban:card:add", async ({ id, column, title }) => {
    const k = kanbans[id];
    const content = String(title || "").trim().slice(0, 200);
    if (!k || !content) return;
    if (!KANBAN_COLUMNS.includes(column)) return;
    let cardId = null;
    try { cardId = await db.kanbanAddCard(id, column, content); }
    catch (e) { console.error("DB kanbanAddCard:", e.message); }
    if (cardId == null) cardId = "m" + (++kanbanMemSeq); // mode mémoire
    k.cards.push({ id: cardId, column, title: content });
    broadcastKanban(id);
  });

  socket.on("kanban:card:move", ({ id, cardId, toColumn }) => {
    const k = kanbans[id];
    if (!k || !KANBAN_COLUMNS.includes(toColumn)) return;
    const card = k.cards.find(c => c.id === cardId);
    if (!card) return;
    card.column = toColumn;
    broadcastKanban(id);
    db.kanbanMoveCard(cardId, toColumn).catch(e => console.error("DB kanbanMoveCard:", e.message));
  });

  socket.on("kanban:card:delete", ({ id, cardId }) => {
    const k = kanbans[id];
    if (!k) return;
    const idx = k.cards.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    k.cards.splice(idx, 1);
    broadcastKanban(id);
    db.kanbanDeleteCard(id, cardId).catch(e => console.error("DB kanbanDeleteCard:", e.message));
  });

  // ─── Événements Vélocité ────────────────────────────────────────────────────

  socket.on("velocity:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    velocities[id] = { name: data.name || null, sprints: [] };
    socket.join("vel:" + id);
    cb(id);

    db.createSession({
      id, name: data.name, hostName: data.hostName, tool: "velocity", taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("velocity:open", async ({ id }) => {
    const v = await ensureVelocity(id).catch(() => null);
    if (!v) return socket.emit("velocity:notfound");
    socket.join("vel:" + id);
    socket.emit("velocity:state", { name: v.name, sprints: v.sprints });
  });

  socket.on("velocity:sprint:add", async ({ id, sprintName, committed, completed }) => {
    const v = velocities[id];
    const name = String(sprintName || "").trim().slice(0, 100);
    const c1 = Math.max(0, Math.min(9999, parseInt(committed) || 0));
    const c2 = Math.max(0, Math.min(9999, parseInt(completed) || 0));
    if (!v || !name) return;
    let sprintId = null;
    try { sprintId = await db.velocityAddSprint(id, name, c1, c2); }
    catch (e) { console.error("DB velocityAddSprint:", e.message); }
    if (sprintId == null) sprintId = "m" + Date.now(); // mode mémoire
    v.sprints.push({ id: sprintId, name, committed: c1, completed: c2 });
    broadcastVelocity(id);
  });

  socket.on("velocity:sprint:delete", ({ id, sprintId }) => {
    const v = velocities[id];
    if (!v) return;
    const idx = v.sprints.findIndex(s => s.id === sprintId);
    if (idx === -1) return;
    v.sprints.splice(idx, 1);
    broadcastVelocity(id);
    db.velocityDeleteSprint(id, sprintId).catch(e => console.error("DB velocityDeleteSprint:", e.message));
  });

  // ─── Événements OKR ─────────────────────────────────────────────────────────

  socket.on("okr:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    okrs[id] = { name: data.name || null, objectives: [] };
    socket.join("okr:" + id);
    cb(id);

    db.createSession({
      id, name: data.name, hostName: data.hostName, tool: "okr", taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("okr:open", async ({ id }) => {
    const o = await ensureOkr(id).catch(() => null);
    if (!o) return socket.emit("okr:notfound");
    socket.join("okr:" + id);
    socket.emit("okr:state", { name: o.name, objectives: o.objectives });
  });

  socket.on("okr:objective:add", async ({ id, title }) => {
    const o = okrs[id];
    const t = String(title || "").trim().slice(0, 200);
    if (!o || !t) return;
    let objId = null;
    try { objId = await db.okrAddObjective(id, t); }
    catch (e) { console.error("DB okrAddObjective:", e.message); }
    if (objId == null) objId = "m" + Date.now();
    o.objectives.push({ id: objId, title: t, keyResults: [] });
    broadcastOkr(id);
  });

  socket.on("okr:objective:delete", ({ id, objectiveId }) => {
    const o = okrs[id];
    if (!o) return;
    const idx = o.objectives.findIndex(x => x.id === objectiveId);
    if (idx === -1) return;
    o.objectives.splice(idx, 1);
    broadcastOkr(id);
    db.okrDeleteObjective(objectiveId).catch(e => console.error("DB okrDeleteObjective:", e.message));
  });

  socket.on("okr:kr:add", async ({ id, objectiveId, title }) => {
    const o = okrs[id];
    const t = String(title || "").trim().slice(0, 200);
    const obj = o?.objectives.find(x => x.id === objectiveId);
    if (!obj || !t) return;
    let krId = null;
    try { krId = await db.okrAddKeyResult(objectiveId, t); }
    catch (e) { console.error("DB okrAddKeyResult:", e.message); }
    if (krId == null) krId = "m" + Date.now();
    obj.keyResults.push({ id: krId, title: t, progress: 0 });
    broadcastOkr(id);
  });

  socket.on("okr:kr:update", ({ id, objectiveId, krId, progress }) => {
    const o = okrs[id];
    const obj = o?.objectives.find(x => x.id === objectiveId);
    const kr = obj?.keyResults.find(k => k.id === krId);
    if (!kr) return;
    kr.progress = Math.max(0, Math.min(100, parseInt(progress) || 0));
    broadcastOkr(id);
    db.okrUpdateKeyResult(krId, kr.progress).catch(e => console.error("DB okrUpdateKeyResult:", e.message));
  });

  socket.on("okr:kr:delete", ({ id, objectiveId, krId }) => {
    const o = okrs[id];
    const obj = o?.objectives.find(x => x.id === objectiveId);
    if (!obj) return;
    const idx = obj.keyResults.findIndex(k => k.id === krId);
    if (idx === -1) return;
    obj.keyResults.splice(idx, 1);
    broadcastOkr(id);
    db.okrDeleteKeyResult(krId).catch(e => console.error("DB okrDeleteKeyResult:", e.message));
  });

  // ─── Événements Rétro-planning (Gantt) ─────────────────────────────────────

  socket.on("gantt:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    ganttBoards[id] = { name: data.name || null, tasks: [] };
    socket.join("gantt:" + id);
    cb(id);

    db.createSession({
      id, name: data.name, hostName: data.hostName, tool: "gantt", taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("gantt:open", async ({ id }) => {
    const g = await ensureGantt(id).catch(() => null);
    if (!g) return socket.emit("gantt:notfound");
    socket.join("gantt:" + id);
    socket.emit("gantt:state", { name: g.name, tasks: g.tasks });
  });

  socket.on("gantt:task:add", async ({ id, name, duration, dependsOn }) => {
    const g = ganttBoards[id];
    const t = String(name || "").trim().slice(0, 200);
    const d = Math.max(1, Math.min(365, parseInt(duration) || 1));
    if (!g || !t) return;
    const validDeps = Array.isArray(dependsOn)
      ? dependsOn.filter(depId => g.tasks.some(x => x.id === depId))
      : [];
    let taskId = null;
    try { taskId = await db.ganttAddTask(id, t, d); }
    catch (e) { console.error("DB ganttAddTask:", e.message); }
    if (taskId == null) taskId = "m" + Date.now(); // mode mémoire
    g.tasks.push({ id: taskId, name: t, duration: d, dependsOn: validDeps });
    if (validDeps.length && typeof taskId !== "string") {
      db.ganttSetDependencies(taskId, validDeps).catch(e => console.error("DB ganttSetDependencies:", e.message));
    }
    broadcastGantt(id);
  });

  socket.on("gantt:task:update", ({ id, taskId, name, duration }) => {
    const g = ganttBoards[id];
    const task = g?.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (name != null) task.name = String(name).trim().slice(0, 200) || task.name;
    if (duration != null) task.duration = Math.max(1, Math.min(365, parseInt(duration) || task.duration));
    broadcastGantt(id);
    db.ganttUpdateTask(taskId, task.name, task.duration).catch(e => console.error("DB ganttUpdateTask:", e.message));
  });

  // Remplace l'ensemble des dépendances d'une tâche. La détection de cycle
  // n'est pas bloquée ici : elle est signalée visuellement côté client
  // (bannière d'avertissement) plutôt que rejetée côté serveur, pour rester
  // simple — un cycle temporaire pendant l'édition n'est pas dangereux,
  // juste non calculable tant qu'il n'est pas corrigé.
  socket.on("gantt:task:deps:update", ({ id, taskId, dependsOn }) => {
    const g = ganttBoards[id];
    const task = g?.tasks.find(t => t.id === taskId);
    if (!task) return;
    const validDeps = Array.isArray(dependsOn)
      ? dependsOn.filter(depId => depId !== taskId && g.tasks.some(x => x.id === depId))
      : [];
    task.dependsOn = validDeps;
    broadcastGantt(id);
    db.ganttSetDependencies(taskId, validDeps).catch(e => console.error("DB ganttSetDependencies:", e.message));
  });

  socket.on("gantt:task:delete", ({ id, taskId }) => {
    const g = ganttBoards[id];
    if (!g) return;
    const idx = g.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    g.tasks.splice(idx, 1);
    // Retire aussi les références à cette tâche comme dépendance ailleurs,
    // pour ne pas laisser de dépendance fantôme en mémoire.
    g.tasks.forEach(t => { t.dependsOn = t.dependsOn.filter(d => d !== taskId); });
    broadcastGantt(id);
    db.ganttDeleteTask(taskId).catch(e => console.error("DB ganttDeleteTask:", e.message));
  });

  // ─── Événements Planificateur de capacité ──────────────────────────────────

  socket.on("capacity:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    capacityBoards[id] = { name: data.name || null, entries: [] };
    socket.join("cap:" + id);
    cb(id);

    db.createSession({
      id, name: data.name, hostName: data.hostName, tool: "capacity", taskCount: 0
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("capacity:open", async ({ id }) => {
    const c = await ensureCapacity(id).catch(() => null);
    if (!c) return socket.emit("capacity:notfound");
    socket.join("cap:" + id);
    socket.emit("capacity:state", { name: c.name, entries: c.entries });
  });

  socket.on("capacity:entry:add", async ({ id, sprintName, refVelocity, members }) => {
    const c = capacityBoards[id];
    const name = String(sprintName || "").trim().slice(0, 100);
    const ref = Math.max(0, Math.min(9999, parseInt(refVelocity) || 0));
    if (!c || !name) return;
    const cleanMembers = Array.isArray(members)
      ? members
          .map(m => ({
            name: String(m.name || "").trim().slice(0, 60),
            availability: Math.max(0, Math.min(100, parseInt(m.availability) || 0)),
          }))
          .filter(m => m.name)
          .slice(0, 30) // limite raisonnable, évite un abus de la taille du JSONB
      : [];
    const suggested = computeSuggestedCapacity(ref, cleanMembers);
    let entryId = null;
    try { entryId = await db.capacityAddEntry(id, name, ref, cleanMembers, suggested); }
    catch (e) { console.error("DB capacityAddEntry:", e.message); }
    if (entryId == null) entryId = "m" + Date.now(); // mode mémoire
    c.entries.push({ id: entryId, sprintName: name, refVelocity: ref, members: cleanMembers, suggested });
    broadcastCapacity(id);
  });

  socket.on("capacity:entry:delete", ({ id, entryId }) => {
    const c = capacityBoards[id];
    if (!c) return;
    const idx = c.entries.findIndex(e => e.id === entryId);
    if (idx === -1) return;
    c.entries.splice(idx, 1);
    broadcastCapacity(id);
    db.capacityDeleteEntry(id, entryId).catch(e => console.error("DB capacityDeleteEntry:", e.message));
  });

  // ─── Événements Sondage rapide ──────────────────────────────────────────────

  socket.on("poll:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    const options = (data.options || []).map(o => String(o).trim()).filter(Boolean).slice(0, 8);
    if (options.length < 2) return cb(null);
    polls[id] = {
      question: String(data.question || "").trim().slice(0, 300),
      options,
      votes: {},           // socketId -> optionIndex
      participants: [socket.id],
      closed: false,
    };
    socket.join("poll:" + id);
    cb(id);
    broadcastPoll(id);

    db.createSession({
      id, name: data.question, hostName: data.hostName, tool: "poll", taskCount: options.length
    }).catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("poll:join", ({ id }) => {
    const p = polls[id];
    if (!p) return socket.emit("poll:notfound");
    if (!p.participants.includes(socket.id)) p.participants.push(socket.id);
    socket.join("poll:" + id);
    broadcastPoll(id);
  });

  socket.on("poll:state", ({ id, isHost }) => {
    const p = polls[id];
    if (!p) return socket.emit("poll:notfound");
    socket.join("poll:" + id);
    if (isHost && p.participants[0] !== socket.id) {
      const idx = p.participants.indexOf(socket.id);
      if (idx > 0) p.participants.splice(idx, 1);
      p.participants[0] = socket.id;
    } else if (!p.participants.includes(socket.id)) {
      p.participants.push(socket.id);
    }
    broadcastPoll(id);
  });

  socket.on("poll:vote", ({ id, optionIndex }) => {
    const p = polls[id];
    if (!p || p.closed) return;
    if (optionIndex < 0 || optionIndex >= p.options.length) return;
    p.votes[socket.id] = optionIndex;
    broadcastPoll(id);
  });

  socket.on("poll:close", ({ id }) => {
    const p = polls[id];
    if (!p) return;
    if (p.participants[0] !== socket.id) return; // hôte uniquement
    p.closed = true;
    broadcastPoll(id);
    const tally = p.options.map((opt, i) => ({
      text: opt, votes: Object.values(p.votes).filter(v => v === i).length,
    }));
    db.savePollResults(id, tally).catch(e => console.error("DB savePollResults:", e.message));
    db.finishSession(id).catch(e => console.error("DB finishSession:", e.message));
    setTimeout(() => { delete polls[id]; }, 24 * 60 * 60 * 1000);
  });

  // ─── Événements Objectif de sprint ──────────────────────────────────────────

  socket.on("goal:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    goalBoards[id] = { name: data.name || null, entries: [] };
    socket.join("goal:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "goal", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("goal:open", async ({ id }) => {
    const g = await ensureGoal(id).catch(() => null);
    if (!g) return socket.emit("goal:notfound");
    socket.join("goal:" + id);
    socket.emit("goal:state", { name: g.name, entries: g.entries });
  });

  socket.on("goal:entry:add", async ({ id, sprintName, goalText, votes }) => {
    const g = goalBoards[id];
    const name = String(sprintName || "").trim().slice(0, 100);
    const text = String(goalText || "").trim().slice(0, 300);
    if (!g || !name || !text) return;
    const cleanVotes = Array.isArray(votes)
      ? votes.map(v => ({
          name: String(v.name || "").trim().slice(0, 60),
          confidence: Math.max(1, Math.min(5, parseInt(v.confidence) || 3)),
        })).filter(v => v.name).slice(0, 30)
      : [];
    let entryId = null;
    try { entryId = await db.goalAddEntry(id, name, text, cleanVotes); }
    catch (e) { console.error("DB goalAddEntry:", e.message); }
    if (entryId == null) entryId = "m" + Date.now();
    g.entries.push({ id: entryId, sprintName: name, goalText: text, votes: cleanVotes, achieved: null });
    broadcastGoal(id);
  });

  socket.on("goal:entry:achieved", ({ id, entryId, achieved }) => {
    const g = goalBoards[id];
    const entry = g?.entries.find(e => e.id === entryId);
    if (!entry) return;
    entry.achieved = achieved;
    broadcastGoal(id);
    db.goalSetAchieved(entryId, achieved).catch(e => console.error("DB goalSetAchieved:", e.message));
  });

  socket.on("goal:entry:delete", ({ id, entryId }) => {
    const g = goalBoards[id];
    if (!g) return;
    const idx = g.entries.findIndex(e => e.id === entryId);
    if (idx === -1) return;
    g.entries.splice(idx, 1);
    broadcastGoal(id);
    db.goalDeleteEntry(id, entryId).catch(e => console.error("DB goalDeleteEntry:", e.message));
  });

  // ─── Événements Definition of Done ──────────────────────────────────────────

  socket.on("dod:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    dodBoards[id] = { name: data.name || null, items: [] };
    socket.join("dod:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "dod", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("dod:open", async ({ id }) => {
    const d = await ensureDod(id).catch(() => null);
    if (!d) return socket.emit("dod:notfound");
    socket.join("dod:" + id);
    socket.emit("dod:state", { name: d.name, items: d.items });
  });

  socket.on("dod:item:add", async ({ id, text }) => {
    const d = dodBoards[id];
    const t = String(text || "").trim().slice(0, 200);
    if (!d || !t) return;
    let itemId = null;
    try { itemId = await db.dodAddItem(id, t); }
    catch (e) { console.error("DB dodAddItem:", e.message); }
    if (itemId == null) itemId = "m" + Date.now();
    d.items.push({ id: itemId, text: t, checked: false });
    broadcastDod(id);
  });

  socket.on("dod:item:toggle", ({ id, itemId }) => {
    const d = dodBoards[id];
    const item = d?.items.find(i => i.id === itemId);
    if (!item) return;
    item.checked = !item.checked;
    broadcastDod(id);
    db.dodToggleItem(itemId, item.checked).catch(e => console.error("DB dodToggleItem:", e.message));
  });

  socket.on("dod:item:delete", ({ id, itemId }) => {
    const d = dodBoards[id];
    if (!d) return;
    const idx = d.items.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    d.items.splice(idx, 1);
    broadcastDod(id);
    db.dodDeleteItem(itemId).catch(e => console.error("DB dodDeleteItem:", e.message));
  });

  socket.on("dod:reset", ({ id }) => {
    const d = dodBoards[id];
    if (!d) return;
    d.items.forEach(i => i.checked = false);
    broadcastDod(id);
    db.dodResetAll(id).catch(e => console.error("DB dodResetAll:", e.message));
  });

  // ─── Événements Journal de décisions ────────────────────────────────────────

  socket.on("decisions:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    decisionBoards[id] = { name: data.name || null, decisions: [] };
    socket.join("dec:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "decisions", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("decisions:open", async ({ id }) => {
    const d = await ensureDecisions(id).catch(() => null);
    if (!d) return socket.emit("decisions:notfound");
    socket.join("dec:" + id);
    socket.emit("decisions:state", { name: d.name, decisions: d.decisions });
  });

  socket.on("decisions:add", async ({ id, title, context, decidedBy }) => {
    const d = decisionBoards[id];
    const t = String(title || "").trim().slice(0, 200);
    const c = String(context || "").trim().slice(0, 1000);
    const by = String(decidedBy || "").trim().slice(0, 60) || null;
    if (!d || !t) return;
    let decId = null;
    try { decId = await db.decisionAdd(id, t, c, by, "acceptée"); }
    catch (e) { console.error("DB decisionAdd:", e.message); }
    if (decId == null) decId = "m" + Date.now();
    d.decisions.unshift({ id: decId, title: t, context: c, decidedBy: by, status: "acceptée", createdAt: new Date().toISOString() });
    broadcastDecisions(id);
  });

  socket.on("decisions:status", ({ id, decisionId, status }) => {
    const d = decisionBoards[id];
    const dec = d?.decisions.find(x => x.id === decisionId);
    const validStatuses = ["proposée", "acceptée", "obsolète"];
    if (!dec || !validStatuses.includes(status)) return;
    dec.status = status;
    broadcastDecisions(id);
    db.decisionUpdateStatus(decisionId, status).catch(e => console.error("DB decisionUpdateStatus:", e.message));
  });

  socket.on("decisions:delete", ({ id, decisionId }) => {
    const d = decisionBoards[id];
    if (!d) return;
    const idx = d.decisions.findIndex(x => x.id === decisionId);
    if (idx === -1) return;
    d.decisions.splice(idx, 1);
    broadcastDecisions(id);
    db.decisionDelete(id, decisionId).catch(e => console.error("DB decisionDelete:", e.message));
  });

  // ─── Événements Post-mortem d'incident ──────────────────────────────────────

  socket.on("postmortem:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    postmortemBoards[id] = { name: data.name || null, timeline: [], rootCause: "", actions: [] };
    socket.join("pm:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "postmortem", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
    savePostmortem(id);
  });

  socket.on("postmortem:open", async ({ id }) => {
    const p = await ensurePostmortem(id).catch(() => null);
    if (!p) return socket.emit("postmortem:notfound");
    socket.join("pm:" + id);
    socket.emit("postmortem:state", p);
  });

  socket.on("postmortem:timeline:add", ({ id, time, text }) => {
    const p = postmortemBoards[id];
    const t = String(text || "").trim().slice(0, 300);
    if (!p || !t) return;
    p.timeline.push({ time: String(time || "").trim().slice(0, 30), text: t });
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  socket.on("postmortem:timeline:delete", ({ id, index }) => {
    const p = postmortemBoards[id];
    if (!p || index < 0 || index >= p.timeline.length) return;
    p.timeline.splice(index, 1);
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  socket.on("postmortem:rootcause:update", ({ id, text }) => {
    const p = postmortemBoards[id];
    if (!p) return;
    p.rootCause = String(text || "").slice(0, 2000);
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  socket.on("postmortem:action:add", ({ id, text }) => {
    const p = postmortemBoards[id];
    const t = String(text || "").trim().slice(0, 200);
    if (!p || !t) return;
    p.actions.push({ text: t, done: false });
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  socket.on("postmortem:action:toggle", ({ id, index }) => {
    const p = postmortemBoards[id];
    if (!p || index < 0 || index >= p.actions.length) return;
    p.actions[index].done = !p.actions[index].done;
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  socket.on("postmortem:action:delete", ({ id, index }) => {
    const p = postmortemBoards[id];
    if (!p || index < 0 || index >= p.actions.length) return;
    p.actions.splice(index, 1);
    broadcastPostmortem(id);
    savePostmortem(id);
  });

  // ─── Événements Suivi de feature flags ──────────────────────────────────────

  socket.on("flags:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    flagBoards[id] = { name: data.name || null, flags: [] };
    socket.join("flags:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "flags", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("flags:open", async ({ id }) => {
    const f = await ensureFlags(id).catch(() => null);
    if (!f) return socket.emit("flags:notfound");
    socket.join("flags:" + id);
    socket.emit("flags:state", { name: f.name, flags: f.flags });
  });

  const FLAG_ENVS = ["dev", "staging", "prod"];
  socket.on("flags:add", async ({ id, name, environment, owner, notes }) => {
    const f = flagBoards[id];
    const n = String(name || "").trim().slice(0, 100);
    const env = FLAG_ENVS.includes(environment) ? environment : "dev";
    const own = String(owner || "").trim().slice(0, 60) || null;
    const note = String(notes || "").trim().slice(0, 300) || null;
    if (!f || !n) return;
    let flagId = null;
    try { flagId = await db.flagAdd(id, n, env, own, note); }
    catch (e) { console.error("DB flagAdd:", e.message); }
    if (flagId == null) flagId = "m" + Date.now();
    f.flags.push({ id: flagId, name: n, active: false, environment: env, owner: own, notes: note });
    broadcastFlags(id);
  });

  socket.on("flags:toggle", ({ id, flagId }) => {
    const f = flagBoards[id];
    const flag = f?.flags.find(x => x.id === flagId);
    if (!flag) return;
    flag.active = !flag.active;
    broadcastFlags(id);
    db.flagToggle(flagId, flag.active).catch(e => console.error("DB flagToggle:", e.message));
  });

  socket.on("flags:update", ({ id, flagId, environment, owner, notes }) => {
    const f = flagBoards[id];
    const flag = f?.flags.find(x => x.id === flagId);
    if (!flag) return;
    flag.environment = FLAG_ENVS.includes(environment) ? environment : flag.environment;
    flag.owner = String(owner || "").trim().slice(0, 60) || null;
    flag.notes = String(notes || "").trim().slice(0, 300) || null;
    broadcastFlags(id);
    db.flagUpdate(flagId, { environment: flag.environment, owner: flag.owner, notes: flag.notes })
      .catch(e => console.error("DB flagUpdate:", e.message));
  });

  socket.on("flags:delete", ({ id, flagId }) => {
    const f = flagBoards[id];
    if (!f) return;
    const idx = f.flags.findIndex(x => x.id === flagId);
    if (idx === -1) return;
    f.flags.splice(idx, 1);
    broadcastFlags(id);
    db.flagDelete(flagId).catch(e => console.error("DB flagDelete:", e.message));
  });

  // ─── Événements Pouls d'équipe ───────────────────────────────────────────────

  socket.on("pulse:create", (data, cb) => {
    const id = Math.random().toString(36).substring(2, 8);
    pulseBoards[id] = { name: data.name || null, entries: [] };
    socket.join("pulse:" + id);
    cb(id);
    db.createSession({ id, name: data.name, hostName: data.hostName, tool: "pulse", taskCount: 0 })
      .catch(e => console.error("DB createSession:", e.message));
  });

  socket.on("pulse:open", async ({ id }) => {
    const p = await ensurePulse(id).catch(() => null);
    if (!p) return socket.emit("pulse:notfound");
    socket.join("pulse:" + id);
    socket.emit("pulse:state", { name: p.name, entries: p.entries });
  });

  socket.on("pulse:checkin", async ({ id, name, mood }) => {
    const p = pulseBoards[id];
    const n = String(name || "").trim().slice(0, 60);
    const m = Math.max(1, Math.min(5, parseInt(mood) || 3));
    if (!p || !n) return;
    const today = new Date().toISOString().slice(0, 10);
    try { await db.pulseCheckin(id, n, m); }
    catch (e) { console.error("DB pulseCheckin:", e.message); }
    const idx = p.entries.findIndex(e => e.name === n && e.day === today);
    if (idx === -1) p.entries.push({ name: n, mood: m, day: today });
    else p.entries[idx].mood = m;
    broadcastPulse(id);
  });

  socket.on("disconnect", () => {
    for (const id in sessions) {
      const idx = sessions[id].participants.findIndex(p => p.id === socket.id);
      if (idx > 0) {
        sessions[id].participants.splice(idx, 1);
        broadcastState(id);
      }
    }
    for (const id in retros) {
      const idx = retros[id].participants.findIndex(p => p.id === socket.id);
      if (idx > 0) {
        retros[id].participants.splice(idx, 1);
        broadcastRetro(id);
      }
    }
    // Daily : on ne retire les participants qu'en lobby
    // (en cours de daily, une coupure réseau ne doit pas casser la rotation)
    for (const id in dailies) {
      if (dailies[id].phase !== "lobby") continue;
      const idx = dailies[id].participants.findIndex(p => p.id === socket.id);
      if (idx > 0) {
        dailies[id].participants.splice(idx, 1);
        broadcastDaily(id);
      }
    }
    for (const id in polls) {
      const p = polls[id];
      const idx = p.participants.indexOf(socket.id);
      if (idx > 0) { // on ne retire jamais l'hôte (index 0)
        p.participants.splice(idx, 1);
        delete p.votes[socket.id];
        broadcastPoll(id);
      }
    }
  });

});

// Init DB avec retry (si Postgres démarre après l'app), sans bloquer le serveur
async function initDbWithRetry(attempts = 5, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.init();
      return;
    } catch (e) {
      console.error(`⚠️ Init DB échouée (tentative ${i}/${attempts}):`, e.message);
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.error("⚠️ Base injoignable — le serveur continue en mode mémoire");
}

const PORT = process.env.PORT || 5544;
server.listen(PORT, "0.0.0.0", () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));
initDbWithRetry();
