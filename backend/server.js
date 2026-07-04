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

// Sessions récentes (pour le hub)
app.get("/api/sessions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    res.json(await db.listSessions(limit));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur base de données" });
  }
});

// Détail d'une session terminée (résultats des votes)
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const session = await db.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session introuvable" });
    res.json(session);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur base de données" });
  }
});

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
