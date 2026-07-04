// ── Base de données PostgreSQL (Railway) ────────────────────────────────────
// Si DATABASE_URL n'est pas définie, le serveur fonctionne comme avant
// (sessions en mémoire uniquement, aucune persistance).
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Railway interne (postgres.railway.internal) → pas de SSL.
    // Connexion externe (proxy public) → SSL sans vérification du certificat.
    ssl: DATABASE_URL.includes("railway.internal")
      ? false
      : { rejectUnauthorized: false },
  });
}

const enabled = () => pool !== null;

async function init() {
  if (!enabled()) {
    console.log("ℹ️  DATABASE_URL absente — persistance désactivée (mode mémoire)");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      name        TEXT,
      host_name   TEXT,
      tool        TEXT NOT NULL DEFAULT 'poker',
      task_count  INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS poker_results (
      id         SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      task_index INT NOT NULL,
      task       TEXT,
      median     INT,
      votes      JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (session_id, task_index)
    );

    CREATE TABLE IF NOT EXISTS retro_notes (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      content     TEXT NOT NULL,
      votes       INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS daily_times (
      id           SERIAL PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      seconds_used INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kanban_cards (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      column_name TEXT NOT NULL,
      title       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions (created_at DESC);
  `);
  console.log("✅ Base de données initialisée");
}

// ── Écritures (appelées depuis les événements Socket.IO) ────────────────────

async function createSession({ id, name, hostName, tool = "poker", taskCount = 0 }) {
  if (!enabled()) return;
  await pool.query(
    `INSERT INTO sessions (id, name, host_name, tool, task_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, name || null, hostName || null, tool, taskCount]
  );
}

async function saveResult({ sessionId, taskIndex, task, median, votes }) {
  if (!enabled()) return;
  await pool.query(
    `INSERT INTO poker_results (session_id, task_index, task, median, votes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id, task_index)
     DO UPDATE SET median = EXCLUDED.median, votes = EXCLUDED.votes`,
    [sessionId, taskIndex, task || null, median, JSON.stringify(votes)]
  );
}

async function saveRetroNotes(sessionId, notes) {
  if (!enabled() || notes.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Idempotent : on repart de zéro si la rétro est re-terminée
    await client.query(`DELETE FROM retro_notes WHERE session_id = $1`, [sessionId]);
    for (const n of notes) {
      await client.query(
        `INSERT INTO retro_notes (session_id, column_name, content, votes)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, n.column, n.text, n.votes]
      );
    }
    await client.query(
      `UPDATE sessions SET task_count = $2 WHERE id = $1`,
      [sessionId, notes.length]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function saveDailyTimes(sessionId, times) {
  if (!enabled() || times.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM daily_times WHERE session_id = $1`, [sessionId]);
    for (const t of times) {
      await client.query(
        `INSERT INTO daily_times (session_id, name, seconds_used) VALUES ($1, $2, $3)`,
        [sessionId, t.name, t.seconds]
      );
    }
    await client.query(
      `UPDATE sessions SET task_count = $2 WHERE id = $1`,
      [sessionId, times.length]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Kanban : la base est la source de vérité ────────────────────────────────

async function kanbanAddCard(sessionId, column, title) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO kanban_cards (session_id, column_name, title)
     VALUES ($1, $2, $3) RETURNING id`,
    [sessionId, column, title]
  );
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM kanban_cards WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
  return rows[0].id;
}

async function kanbanMoveCard(cardId, column) {
  if (!enabled()) return;
  await pool.query(`UPDATE kanban_cards SET column_name = $2 WHERE id = $1`, [cardId, column]);
}

async function kanbanDeleteCard(sessionId, cardId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM kanban_cards WHERE id = $1`, [cardId]);
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM kanban_cards WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
}

async function kanbanLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'kanban'`, [id]);
  if (s.rows.length === 0) return null;
  const c = await pool.query(
    `SELECT id, column_name, title FROM kanban_cards WHERE session_id = $1 ORDER BY id`,
    [id]
  );
  return {
    name: s.rows[0].name,
    cards: c.rows.map(r => ({ id: r.id, column: r.column_name, title: r.title }))
  };
}

async function finishSession(id) {
  if (!enabled()) return;
  await pool.query(
    `UPDATE sessions SET finished_at = now() WHERE id = $1 AND finished_at IS NULL`,
    [id]
  );
}

// ── Lectures (API REST pour le hub) ─────────────────────────────────────────

async function listSessions(limit = 20) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.host_name, s.tool, s.task_count,
            s.created_at, s.finished_at,
            COUNT(r.id)::int AS results_count
     FROM sessions s
     LEFT JOIN poker_results r ON r.session_id = s.id
     GROUP BY s.id
     ORDER BY s.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getSession(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (s.rows.length === 0) return null;
  const session = s.rows[0];

  let results;
  if (session.tool === "retro") {
    const r = await pool.query(
      `SELECT column_name, content, votes
       FROM retro_notes WHERE session_id = $1
       ORDER BY votes DESC, id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "daily") {
    const r = await pool.query(
      `SELECT name, seconds_used FROM daily_times WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "kanban") {
    const r = await pool.query(
      `SELECT id, column_name, title FROM kanban_cards WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else {
    const r = await pool.query(
      `SELECT task_index, task, median, votes
       FROM poker_results WHERE session_id = $1 ORDER BY task_index`,
      [id]
    );
    results = r.rows;
  }
  return { ...session, results };
}

module.exports = {
  init, enabled, createSession, saveResult, saveRetroNotes, saveDailyTimes,
  kanbanAddCard, kanbanMoveCard, kanbanDeleteCard, kanbanLoadBoard,
  finishSession, listSessions, getSession
};
