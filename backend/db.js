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

    CREATE TABLE IF NOT EXISTS velocity_sprints (
      id           SERIAL PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sprint_name  TEXT NOT NULL,
      committed    INT NOT NULL DEFAULT 0,
      completed    INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS okr_objectives (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      position    INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS okr_key_results (
      id            SERIAL PRIMARY KEY,
      objective_id  INT NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      progress      INT NOT NULL DEFAULT 0,
      position      INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gantt_tasks (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      duration    INT NOT NULL DEFAULT 1,
      position    INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Table de jonction : task_id dépend de depends_on_id.
    -- Les deux clés étrangères sont en CASCADE pour que la suppression
    -- d'une tâche nettoie toutes les dépendances qui la référencent,
    -- qu'elle soit la tâche dépendante ou la tâche dont on dépend.
    CREATE TABLE IF NOT EXISTS gantt_dependencies (
      id             SERIAL PRIMARY KEY,
      task_id        INT NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
      depends_on_id  INT NOT NULL REFERENCES gantt_tasks(id) ON DELETE CASCADE,
      UNIQUE (task_id, depends_on_id)
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

// ── Vélocité : la base est la source de vérité (comme le Kanban) ───────────

async function velocityAddSprint(sessionId, sprintName, committed, completed) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO velocity_sprints (session_id, sprint_name, committed, completed)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [sessionId, sprintName, committed, completed]
  );
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM velocity_sprints WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
  return rows[0].id;
}

async function velocityDeleteSprint(sessionId, sprintId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM velocity_sprints WHERE id = $1`, [sprintId]);
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM velocity_sprints WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
}

async function velocityLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'velocity'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, sprint_name, committed, completed
     FROM velocity_sprints WHERE session_id = $1 ORDER BY id`,
    [id]
  );
  return {
    name: s.rows[0].name,
    sprints: r.rows.map(row => ({
      id: row.id, name: row.sprint_name, committed: row.committed, completed: row.completed
    }))
  };
}

// ── OKR léger : la base est la source de vérité (comme le Kanban) ──────────

async function okrAddObjective(sessionId, title) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO okr_objectives (session_id, title, position)
     VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM okr_objectives WHERE session_id = $1))
     RETURNING id`,
    [sessionId, title]
  );
  return rows[0].id;
}

async function okrDeleteObjective(objectiveId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM okr_objectives WHERE id = $1`, [objectiveId]);
}

async function okrAddKeyResult(objectiveId, title) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO okr_key_results (objective_id, title, progress, position)
     VALUES ($1, $2, 0, (SELECT COALESCE(MAX(position), -1) + 1 FROM okr_key_results WHERE objective_id = $1))
     RETURNING id`,
    [objectiveId, title]
  );
  return rows[0].id;
}

async function okrUpdateKeyResult(krId, progress) {
  if (!enabled()) return;
  await pool.query(`UPDATE okr_key_results SET progress = $2 WHERE id = $1`, [krId, progress]);
}

async function okrDeleteKeyResult(krId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM okr_key_results WHERE id = $1`, [krId]);
}

async function okrLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'okr'`, [id]);
  if (s.rows.length === 0) return null;
  const objs = await pool.query(
    `SELECT id, title FROM okr_objectives WHERE session_id = $1 ORDER BY position, id`,
    [id]
  );
  const krs = await pool.query(
    `SELECT k.id, k.objective_id, k.title, k.progress
     FROM okr_key_results k
     JOIN okr_objectives o ON o.id = k.objective_id
     WHERE o.session_id = $1
     ORDER BY k.position, k.id`,
    [id]
  );
  return {
    name: s.rows[0].name,
    objectives: objs.rows.map(o => ({
      id: o.id,
      title: o.title,
      keyResults: krs.rows.filter(k => k.objective_id === o.id)
        .map(k => ({ id: k.id, title: k.title, progress: k.progress }))
    }))
  };
}

// ── Rétro-planning (Gantt) : la base est la source de vérité ────────────────

async function ganttAddTask(sessionId, name, duration) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO gantt_tasks (session_id, name, duration, position)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM gantt_tasks WHERE session_id = $1))
     RETURNING id`,
    [sessionId, name, duration]
  );
  return rows[0].id;
}

async function ganttUpdateTask(taskId, name, duration) {
  if (!enabled()) return;
  await pool.query(`UPDATE gantt_tasks SET name = $2, duration = $3 WHERE id = $1`, [taskId, name, duration]);
}

async function ganttDeleteTask(taskId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM gantt_tasks WHERE id = $1`, [taskId]);
}

// Remplace entièrement l'ensemble des dépendances d'une tâche (transaction).
async function ganttSetDependencies(taskId, dependsOnIds) {
  if (!enabled()) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM gantt_dependencies WHERE task_id = $1`, [taskId]);
    for (const depId of dependsOnIds) {
      if (depId === taskId) continue; // pas d'auto-dépendance
      await client.query(
        `INSERT INTO gantt_dependencies (task_id, depends_on_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [taskId, depId]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function ganttLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'gantt'`, [id]);
  if (s.rows.length === 0) return null;
  const tasks = await pool.query(
    `SELECT id, name, duration FROM gantt_tasks WHERE session_id = $1 ORDER BY position, id`,
    [id]
  );
  const deps = await pool.query(
    `SELECT d.task_id, d.depends_on_id
     FROM gantt_dependencies d
     JOIN gantt_tasks t ON t.id = d.task_id
     WHERE t.session_id = $1`,
    [id]
  );
  return {
    name: s.rows[0].name,
    tasks: tasks.rows.map(t => ({
      id: t.id,
      name: t.name,
      duration: t.duration,
      dependsOn: deps.rows.filter(d => d.task_id === t.id).map(d => d.depends_on_id)
    }))
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
  } else if (session.tool === "velocity") {
    const r = await pool.query(
      `SELECT id, sprint_name, committed, completed FROM velocity_sprints WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "okr") {
    const r = await pool.query(
      `SELECT o.title AS objective, k.title AS key_result, k.progress
       FROM okr_objectives o
       LEFT JOIN okr_key_results k ON k.objective_id = o.id
       WHERE o.session_id = $1 ORDER BY o.position, k.position`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "gantt") {
    const r = await pool.query(
      `SELECT t.id, t.name, t.duration,
              array_remove(array_agg(d.depends_on_id), NULL) AS depends_on
       FROM gantt_tasks t
       LEFT JOIN gantt_dependencies d ON d.task_id = t.id
       WHERE t.session_id = $1
       GROUP BY t.id ORDER BY t.position, t.id`,
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
  velocityAddSprint, velocityDeleteSprint, velocityLoadBoard,
  okrAddObjective, okrDeleteObjective, okrAddKeyResult, okrUpdateKeyResult,
  okrDeleteKeyResult, okrLoadBoard,
  ganttAddTask, ganttUpdateTask, ganttDeleteTask, ganttSetDependencies, ganttLoadBoard,
  finishSession, listSessions, getSession
};
