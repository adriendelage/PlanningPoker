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

    -- Chaque entrée = un sprint planifié : vélocité de référence (que
    -- l'utilisateur récupère manuellement depuis son tableau de Vélocité
    -- s'il en a un — pas de lien inter-outils en base, pour rester simple)
    -- et disponibilité de chaque membre pour ce sprint.
    CREATE TABLE IF NOT EXISTS capacity_entries (
      id           SERIAL PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sprint_name  TEXT NOT NULL,
      ref_velocity INT NOT NULL DEFAULT 0,
      members      JSONB NOT NULL DEFAULT '[]',
      suggested    INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Sondage rapide : éphémère comme le Poker (snapshot en base à la clôture)
    CREATE TABLE IF NOT EXISTS poll_results (
      id           SERIAL PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      option_text  TEXT NOT NULL,
      vote_count   INT NOT NULL DEFAULT 0
    );

    -- Objectif de sprint : permanent, historique d'objectifs archivés
    CREATE TABLE IF NOT EXISTS sprint_goals (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sprint_name TEXT NOT NULL,
      goal_text   TEXT NOT NULL,
      votes       JSONB NOT NULL DEFAULT '[]',
      achieved    BOOLEAN,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Definition of Done : checklist partagée et réinitialisable
    CREATE TABLE IF NOT EXISTS dod_items (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      checked     BOOLEAN NOT NULL DEFAULT false,
      position    INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Journal de décisions (ADR léger)
    CREATE TABLE IF NOT EXISTS decisions (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      context     TEXT NOT NULL DEFAULT '',
      decided_by  TEXT,
      status      TEXT NOT NULL DEFAULT 'acceptée',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Post-mortem d'incident : un tableau = un incident (relation 1:1 avec sessions)
    CREATE TABLE IF NOT EXISTS postmortems (
      session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      timeline    JSONB NOT NULL DEFAULT '[]',
      root_cause  TEXT NOT NULL DEFAULT '',
      actions     JSONB NOT NULL DEFAULT '[]'
    );

    -- Suivi de feature flags
    CREATE TABLE IF NOT EXISTS feature_flags (
      id           SERIAL PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      active       BOOLEAN NOT NULL DEFAULT false,
      environment  TEXT NOT NULL DEFAULT 'dev',
      owner        TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Pouls d'équipe : un check-in par personne et par jour (upsert)
    CREATE TABLE IF NOT EXISTS pulse_entries (
      id          SERIAL PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      mood        INT NOT NULL,
      day         DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (session_id, name, day)
    );

    -- ═══ Espace de travail connecté (mode compte, indépendant du mode lien) ═══
    -- Complètement isolé des tables ci-dessus : aucun outil existant ne les
    -- référence. C'est la fondation de l'étape 2 (table "items" partagée).

    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT UNIQUE NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id          SERIAL PRIMARY KEY,
      user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role        TEXT NOT NULL DEFAULT 'owner',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, org_id)
    );

    -- ═══ Étape 2 : table "items" partagée (le coeur du mode connecté) ═══
    -- Contrairement aux tables des outils en mode lien (kanban_cards,
    -- gantt_tasks, velocity_sprints...), qui restent isolées par outil,
    -- ici un seul objet ("item") traverse tout : le tableau, les sprints,
    -- la vélocité calculée. Rattaché à une organisation, pas à une session.

    CREATE TABLE IF NOT EXISTS sprints (
      id          SERIAL PRIMARY KEY,
      org_id      INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      goal        TEXT,
      start_date  DATE,
      end_date    DATE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS items (
      id            SERIAL PRIMARY KEY,
      org_id        INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'todo',
      assignee      TEXT,
      story_points  INT,
      sprint_id     INT REFERENCES sprints(id) ON DELETE SET NULL,
      position      INT NOT NULL DEFAULT 0,
      created_by    INT REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_items_org ON items (org_id);
    CREATE INDEX IF NOT EXISTS idx_sprints_org ON sprints (org_id);

    -- ═══ Étape 3 : fiche détail d'un item ═══
    -- Commentaires, historique d'activité et dépendances entre items —
    -- le modèle de dépendances reprend exactement celui du Gantt en mode
    -- lien (gantt_dependencies), mais référence items au lieu de gantt_tasks.

    CREATE TABLE IF NOT EXISTS item_comments (
      id          SERIAL PRIMARY KEY,
      item_id     INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id     INT REFERENCES users(id) ON DELETE SET NULL,
      body        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- "action" typiques : created, status_changed, updated, comment_added,
    -- dependency_added, dependency_removed. "details" garde le contexte
    -- (ex: {"from":"todo","to":"done"}) en JSONB plutôt qu'en colonnes
    -- fixes, puisque chaque type d'action a une forme différente.
    CREATE TABLE IF NOT EXISTS item_activity (
      id          SERIAL PRIMARY KEY,
      item_id     INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      user_id     INT REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT NOT NULL,
      details     JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS item_dependencies (
      id             SERIAL PRIMARY KEY,
      item_id        INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      depends_on_id  INT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      UNIQUE (item_id, depends_on_id)
    );

    CREATE INDEX IF NOT EXISTS idx_item_comments_item ON item_comments (item_id);
    CREATE INDEX IF NOT EXISTS idx_item_activity_item ON item_activity (item_id);

    -- ═══ Étape 4 : rôles et permissions ═══
    -- Pas d'envoi d'email réel (aucun service comme SendGrid configuré
    -- dans ce projet) : une invitation génère un lien à partager
    -- manuellement (voir backend/invitations.js), pas un email automatique.
    CREATE TABLE IF NOT EXISTS org_invitations (
      id           SERIAL PRIMARY KEY,
      org_id       INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email        TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'member',
      token        TEXT UNIQUE NOT NULL,
      invited_by   INT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      accepted_at  TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_invitations_org ON org_invitations (org_id);

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

// ── Planificateur de capacité : la base est la source de vérité ────────────

async function capacityAddEntry(sessionId, sprintName, refVelocity, members, suggested) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO capacity_entries (session_id, sprint_name, ref_velocity, members, suggested)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [sessionId, sprintName, refVelocity, JSON.stringify(members), suggested]
  );
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM capacity_entries WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
  return rows[0].id;
}

async function capacityDeleteEntry(sessionId, entryId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM capacity_entries WHERE id = $1`, [entryId]);
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM capacity_entries WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
}

async function capacityLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'capacity'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, sprint_name, ref_velocity, members, suggested
     FROM capacity_entries WHERE session_id = $1 ORDER BY id`,
    [id]
  );
  return {
    name: s.rows[0].name,
    entries: r.rows.map(row => ({
      id: row.id,
      sprintName: row.sprint_name,
      refVelocity: row.ref_velocity,
      members: row.members,
      suggested: row.suggested,
    }))
  };
}

// ── Sondage rapide : éphémère (snapshot à la clôture) ───────────────────────

async function savePollResults(sessionId, options) {
  if (!enabled() || options.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM poll_results WHERE session_id = $1`, [sessionId]);
    for (const o of options) {
      await client.query(
        `INSERT INTO poll_results (session_id, option_text, vote_count) VALUES ($1, $2, $3)`,
        [sessionId, o.text, o.votes]
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

// ── Objectif de sprint : permanent, historique d'entrées ────────────────────

async function goalAddEntry(sessionId, sprintName, goalText, votes) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO sprint_goals (session_id, sprint_name, goal_text, votes)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [sessionId, sprintName, goalText, JSON.stringify(votes)]
  );
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM sprint_goals WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
  return rows[0].id;
}

async function goalSetAchieved(entryId, achieved) {
  if (!enabled()) return;
  await pool.query(`UPDATE sprint_goals SET achieved = $2 WHERE id = $1`, [entryId, achieved]);
}

async function goalDeleteEntry(sessionId, entryId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM sprint_goals WHERE id = $1`, [entryId]);
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM sprint_goals WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
}

async function goalLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'goal'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, sprint_name, goal_text, votes, achieved FROM sprint_goals WHERE session_id = $1 ORDER BY id`,
    [id]
  );
  return {
    name: s.rows[0].name,
    entries: r.rows.map(row => ({
      id: row.id, sprintName: row.sprint_name, goalText: row.goal_text,
      votes: row.votes, achieved: row.achieved,
    }))
  };
}

// ── Definition of Done : checklist partagée ──────────────────────────────────

async function dodAddItem(sessionId, text) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO dod_items (session_id, text, position)
     VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM dod_items WHERE session_id = $1))
     RETURNING id`,
    [sessionId, text]
  );
  return rows[0].id;
}

async function dodToggleItem(itemId, checked) {
  if (!enabled()) return;
  await pool.query(`UPDATE dod_items SET checked = $2 WHERE id = $1`, [itemId, checked]);
}

async function dodDeleteItem(itemId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM dod_items WHERE id = $1`, [itemId]);
}

async function dodResetAll(sessionId) {
  if (!enabled()) return;
  await pool.query(`UPDATE dod_items SET checked = false WHERE session_id = $1`, [sessionId]);
}

async function dodLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'dod'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, text, checked FROM dod_items WHERE session_id = $1 ORDER BY position, id`,
    [id]
  );
  return { name: s.rows[0].name, items: r.rows };
}

// ── Journal de décisions (ADR léger) ─────────────────────────────────────────

async function decisionAdd(sessionId, title, context, decidedBy, status) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO decisions (session_id, title, context, decided_by, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [sessionId, title, context, decidedBy, status]
  );
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM decisions WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
  return rows[0].id;
}

async function decisionUpdateStatus(decisionId, status) {
  if (!enabled()) return;
  await pool.query(`UPDATE decisions SET status = $2 WHERE id = $1`, [decisionId, status]);
}

async function decisionDelete(sessionId, decisionId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM decisions WHERE id = $1`, [decisionId]);
  await pool.query(
    `UPDATE sessions SET task_count = (SELECT COUNT(*) FROM decisions WHERE session_id = $1) WHERE id = $1`,
    [sessionId]
  );
}

async function decisionLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'decisions'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, title, context, decided_by, status, created_at
     FROM decisions WHERE session_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  return {
    name: s.rows[0].name,
    decisions: r.rows.map(row => ({
      id: row.id, title: row.title, context: row.context,
      decidedBy: row.decided_by, status: row.status, createdAt: row.created_at,
    }))
  };
}

// ── Post-mortem d'incident : un tableau = un incident ────────────────────────

async function postmortemSave(sessionId, { timeline, rootCause, actions }) {
  if (!enabled()) return;
  await pool.query(
    `INSERT INTO postmortems (session_id, timeline, root_cause, actions)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id) DO UPDATE
       SET timeline = EXCLUDED.timeline, root_cause = EXCLUDED.root_cause, actions = EXCLUDED.actions`,
    [sessionId, JSON.stringify(timeline), rootCause, JSON.stringify(actions)]
  );
}

async function postmortemLoad(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'postmortem'`, [id]);
  if (s.rows.length === 0) return null;
  const p = await pool.query(`SELECT * FROM postmortems WHERE session_id = $1`, [id]);
  return {
    name: s.rows[0].name,
    timeline: p.rows[0]?.timeline || [],
    rootCause: p.rows[0]?.root_cause || "",
    actions: p.rows[0]?.actions || [],
  };
}

// ── Suivi de feature flags ───────────────────────────────────────────────────

async function flagAdd(sessionId, name, environment, owner, notes) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO feature_flags (session_id, name, environment, owner, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [sessionId, name, environment, owner, notes]
  );
  return rows[0].id;
}

async function flagToggle(flagId, active) {
  if (!enabled()) return;
  await pool.query(`UPDATE feature_flags SET active = $2 WHERE id = $1`, [flagId, active]);
}

async function flagUpdate(flagId, { environment, owner, notes }) {
  if (!enabled()) return;
  await pool.query(
    `UPDATE feature_flags SET environment = $2, owner = $3, notes = $4 WHERE id = $1`,
    [flagId, environment, owner, notes]
  );
}

async function flagDelete(flagId) {
  if (!enabled()) return;
  await pool.query(`DELETE FROM feature_flags WHERE id = $1`, [flagId]);
}

async function flagLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'flags'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT id, name, active, environment, owner, notes FROM feature_flags WHERE session_id = $1 ORDER BY id`,
    [id]
  );
  return { name: s.rows[0].name, flags: r.rows };
}

// ── Pouls d'équipe : un check-in par personne et par jour ────────────────────

async function pulseCheckin(sessionId, name, mood) {
  if (!enabled()) return;
  await pool.query(
    `INSERT INTO pulse_entries (session_id, name, mood, day)
     VALUES ($1, $2, $3, CURRENT_DATE)
     ON CONFLICT (session_id, name, day) DO UPDATE SET mood = EXCLUDED.mood`,
    [sessionId, name, mood]
  );
}

async function pulseLoadBoard(id) {
  if (!enabled()) return null;
  const s = await pool.query(`SELECT * FROM sessions WHERE id = $1 AND tool = 'pulse'`, [id]);
  if (s.rows.length === 0) return null;
  const r = await pool.query(
    `SELECT name, mood, to_char(day, 'YYYY-MM-DD') AS day
     FROM pulse_entries WHERE session_id = $1 ORDER BY day, id`,
    [id]
  );
  return { name: s.rows[0].name, entries: r.rows };
}

// ═══ Espace de travail connecté : authentification ══════════════════════════

async function authFindUserByEmail(email) {
  if (!enabled()) return null;
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

// Crée l'utilisateur, son organisation et le lien "owner" entre les deux
// dans une seule transaction : soit tout réussit, soit rien n'est créé.
// Le slug de l'organisation est garanti unique (retry avec suffixe en cas
// de collision, plutôt que de vérifier l'unicité avant coup — plus sûr
// contre les races entre deux inscriptions simultanées avec le même nom).
async function authRegister(name, email, passwordHash, orgName, orgSlugBase) {
  if (!enabled()) throw new Error("DB_DISABLED");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );
    const user = userRes.rows[0];

    let org, suffix = 0;
    while (true) {
      const slug = suffix === 0 ? orgSlugBase : `${orgSlugBase}-${suffix}`;
      await client.query("SAVEPOINT before_org_insert");
      try {
        const orgRes = await client.query(
          `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at`,
          [orgName, slug]
        );
        org = orgRes.rows[0];
        break;
      } catch (e) {
        // Un INSERT qui échoue avorte toute la transaction en PostgreSQL —
        // le SAVEPOINT permet de revenir juste avant cet INSERT précis
        // pour réessayer avec un autre slug, sans perdre l'utilisateur
        // déjà créé plus haut dans la même transaction.
        await client.query("ROLLBACK TO SAVEPOINT before_org_insert");
        if (e.code === "23505" && suffix < 20) { suffix++; continue; } // unique_violation sur slug
        throw e;
      }
    }

    await client.query(
      `INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'owner')`,
      [user.id, org.id]
    );

    await client.query("COMMIT");
    return { user, org };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function authGetUserOrgs(userId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, m.role
     FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 ORDER BY m.created_at`,
    [userId]
  );
  return rows;
}

// ═══ Étape 2 : organisations, sprints, items ═════════════════════════════════

async function orgFindBySlug(slug) {
  if (!enabled()) return null;
  const { rows } = await pool.query(`SELECT * FROM organizations WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

async function orgCheckMembership(userId, orgId) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2`,
    [userId, orgId]
  );
  return rows[0] || null;
}

async function sprintsList(orgId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT * FROM sprints WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return rows;
}

async function sprintCreate(orgId, { name, goal, startDate, endDate }) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO sprints (org_id, name, goal, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, name, goal || null, startDate || null, endDate || null]
  );
  return rows[0];
}

async function itemsList(orgId, sprintId) {
  if (!enabled()) return [];
  const params = [orgId];
  let where = "org_id = $1";
  if (sprintId === "backlog") {
    where += " AND sprint_id IS NULL";
  } else if (sprintId) {
    params.push(sprintId);
    where += ` AND sprint_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM items WHERE ${where} ORDER BY position, id`,
    params
  );
  return rows;
}

async function itemCreate(orgId, { title, description, status, assignee, storyPoints, sprintId }, createdBy) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO items (org_id, title, description, status, assignee, story_points, sprint_id, position, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             (SELECT COALESCE(MAX(position), -1) + 1 FROM items WHERE org_id = $1 AND status = $4),
             $8)
     RETURNING *`,
    [orgId, title, description || "", status || "todo", assignee || null, storyPoints ?? null, sprintId || null, createdBy]
  );
  return rows[0];
}

// Toutes les mutations incluent "AND org_id = $orgId" dans le WHERE — même
// si l'appelant a déjà vérifié son appartenance à l'organisation, ça évite
// qu'un identifiant d'item deviné/volé permette de modifier un item d'une
// AUTRE organisation (défense en profondeur contre les IDOR).
async function itemUpdate(itemId, orgId, fields) {
  if (!enabled()) return null;
  const allowed = ["title", "description", "status", "assignee", "story_points", "sprint_id", "position"];
  const sets = [], params = [itemId, orgId];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return null;
  const { rows } = await pool.query(
    `UPDATE items SET ${sets.join(", ")}, updated_at = now()
     WHERE id = $1 AND org_id = $2 RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function itemDelete(itemId, orgId) {
  if (!enabled()) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM items WHERE id = $1 AND org_id = $2`,
    [itemId, orgId]
  );
  return rowCount > 0;
}

// Vélocité calculée depuis les items eux-mêmes (status='done'), groupée
// par sprint — la démonstration concrète que la vélocité n'est plus
// ressaisie à la main comme en mode lien, mais dérivée du tableau partagé.
async function velocityBySprintForOrg(orgId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT s.id AS sprint_id, s.name AS sprint_name,
            COALESCE(SUM(i.story_points) FILTER (WHERE i.status = 'done'), 0) AS completed_points,
            COALESCE(SUM(i.story_points), 0) AS total_points
     FROM sprints s
     LEFT JOIN items i ON i.sprint_id = s.id
     WHERE s.org_id = $1
     GROUP BY s.id, s.name
     ORDER BY s.created_at DESC`,
    [orgId]
  );
  return rows;
}

// ── Étape 3 : fiche détail d'un item ──────────────────────────────────────────

async function itemGetById(itemId, orgId) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `SELECT * FROM items WHERE id = $1 AND org_id = $2`,
    [itemId, orgId]
  );
  return rows[0] || null;
}

async function itemCommentsList(itemId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.name AS user_name
     FROM item_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.item_id = $1 ORDER BY c.created_at ASC`,
    [itemId]
  );
  return rows;
}

async function itemCommentAdd(itemId, userId, body) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO item_comments (item_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at`,
    [itemId, userId, body]
  );
  return rows[0];
}

async function itemActivityList(itemId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.details, a.created_at, u.name AS user_name
     FROM item_activity a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.item_id = $1 ORDER BY a.created_at DESC`,
    [itemId]
  );
  return rows;
}

async function itemActivityLog(itemId, userId, action, details = {}) {
  if (!enabled()) return;
  await pool.query(
    `INSERT INTO item_activity (item_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
    [itemId, userId, action, JSON.stringify(details)]
  );
}

async function itemDependenciesList(itemId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.status
     FROM item_dependencies d JOIN items i ON i.id = d.depends_on_id
     WHERE d.item_id = $1 ORDER BY i.id`,
    [itemId]
  );
  return rows;
}

// dependsOnId doit appartenir à la MÊME organisation que itemId — vérifié
// par le routeur (items.js) avant l'appel, mais on revérifie ici aussi
// (défense en profondeur, comme pour itemUpdate/itemDelete) via la clause
// JOIN sur org_id des deux items.
async function itemDependencyAdd(itemId, dependsOnId, orgId) {
  if (!enabled()) return false;
  const { rowCount } = await pool.query(
    `INSERT INTO item_dependencies (item_id, depends_on_id)
     SELECT $1, $2
     WHERE EXISTS (SELECT 1 FROM items WHERE id = $1 AND org_id = $3)
       AND EXISTS (SELECT 1 FROM items WHERE id = $2 AND org_id = $3)
     ON CONFLICT DO NOTHING`,
    [itemId, dependsOnId, orgId]
  );
  return rowCount > 0;
}

async function itemDependencyRemove(itemId, dependsOnId) {
  if (!enabled()) return;
  await pool.query(
    `DELETE FROM item_dependencies WHERE item_id = $1 AND depends_on_id = $2`,
    [itemId, dependsOnId]
  );
}

// ── Étape 4 : membres et invitations ──────────────────────────────────────────

async function membersList(orgId) {
  if (!enabled()) return [];
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email, m.role, m.created_at AS joined_at
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 ORDER BY m.created_at`,
    [orgId]
  );
  return rows;
}

async function countOwners(orgId) {
  if (!enabled()) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM memberships WHERE org_id = $1 AND role = 'owner'`,
    [orgId]
  );
  return rows[0].n;
}

// Empêche de se retrouver avec une organisation sans aucun propriétaire —
// un état dont on ne pourrait plus sortir (personne n'aurait alors le
// droit de promouvoir qui que ce soit).
async function memberUpdateRole(orgId, userId, newRole) {
  if (!enabled()) return { error: "DB_DISABLED" };
  const current = await pool.query(
    `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (current.rows.length === 0) return { error: "NOT_FOUND" };
  if (current.rows[0].role === "owner" && newRole !== "owner") {
    const owners = await countOwners(orgId);
    if (owners <= 1) return { error: "LAST_OWNER" };
  }
  const { rows } = await pool.query(
    `UPDATE memberships SET role = $3 WHERE org_id = $1 AND user_id = $2 RETURNING role`,
    [orgId, userId, newRole]
  );
  return { role: rows[0].role };
}

async function memberRemove(orgId, userId) {
  if (!enabled()) return { error: "DB_DISABLED" };
  const current = await pool.query(
    `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (current.rows.length === 0) return { error: "NOT_FOUND" };
  if (current.rows[0].role === "owner") {
    const owners = await countOwners(orgId);
    if (owners <= 1) return { error: "LAST_OWNER" };
  }
  await pool.query(`DELETE FROM memberships WHERE org_id = $1 AND user_id = $2`, [orgId, userId]);
  return { ok: true };
}

async function invitationCreate(orgId, email, role, invitedBy, token, expiresAt) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `INSERT INTO org_invitations (org_id, email, role, token, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, email, role, token, invitedBy, expiresAt]
  );
  return rows[0];
}

async function invitationFindByToken(token) {
  if (!enabled()) return null;
  const { rows } = await pool.query(
    `SELECT i.*, o.name AS org_name, o.slug AS org_slug
     FROM org_invitations i JOIN organizations o ON o.id = i.org_id
     WHERE i.token = $1`,
    [token]
  );
  return rows[0] || null;
}

// Transaction : crée l'adhésion (sans écraser un rôle existant plus élevé,
// via ON CONFLICT DO NOTHING) puis marque l'invitation comme acceptée.
async function invitationAccept(invitationId, userId, orgId, role) {
  if (!enabled()) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, org_id) DO NOTHING`,
      [userId, orgId, role]
    );
    await client.query(`UPDATE org_invitations SET accepted_at = now() WHERE id = $1`, [invitationId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
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
  } else if (session.tool === "capacity") {
    const r = await pool.query(
      `SELECT sprint_name, ref_velocity, members, suggested
       FROM capacity_entries WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "poll") {
    const r = await pool.query(
      `SELECT option_text, vote_count FROM poll_results WHERE session_id = $1`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "goal") {
    const r = await pool.query(
      `SELECT sprint_name, goal_text, votes, achieved FROM sprint_goals WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "dod") {
    const r = await pool.query(
      `SELECT text, checked FROM dod_items WHERE session_id = $1 ORDER BY position, id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "decisions") {
    const r = await pool.query(
      `SELECT title, context, decided_by, status FROM decisions WHERE session_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "postmortem") {
    const p = await pool.query(`SELECT * FROM postmortems WHERE session_id = $1`, [id]);
    results = p.rows;
  } else if (session.tool === "flags") {
    const r = await pool.query(
      `SELECT name, active, environment, owner, notes FROM feature_flags WHERE session_id = $1 ORDER BY id`,
      [id]
    );
    results = r.rows;
  } else if (session.tool === "pulse") {
    const r = await pool.query(
      `SELECT name, mood, to_char(day, 'YYYY-MM-DD') AS day FROM pulse_entries WHERE session_id = $1 ORDER BY day`,
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
  capacityAddEntry, capacityDeleteEntry, capacityLoadBoard,
  savePollResults,
  goalAddEntry, goalSetAchieved, goalDeleteEntry, goalLoadBoard,
  dodAddItem, dodToggleItem, dodDeleteItem, dodResetAll, dodLoadBoard,
  decisionAdd, decisionUpdateStatus, decisionDelete, decisionLoadBoard,
  postmortemSave, postmortemLoad,
  flagAdd, flagToggle, flagUpdate, flagDelete, flagLoadBoard,
  pulseCheckin, pulseLoadBoard,
  authFindUserByEmail, authRegister, authGetUserOrgs,
  orgFindBySlug, orgCheckMembership,
  sprintsList, sprintCreate,
  itemsList, itemCreate, itemUpdate, itemDelete, velocityBySprintForOrg,
  itemGetById, itemCommentsList, itemCommentAdd,
  itemActivityList, itemActivityLog,
  itemDependenciesList, itemDependencyAdd, itemDependencyRemove,
  membersList, memberUpdateRole, memberRemove,
  invitationCreate, invitationFindByToken, invitationAccept,
  finishSession, listSessions, getSession
};
