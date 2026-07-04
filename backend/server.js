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
