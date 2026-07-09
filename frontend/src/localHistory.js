// Historique local des sessions — stocké UNIQUEMENT dans le navigateur.
// Rien n'est jamais envoyé au serveur : ce fichier ne fait aucun appel réseau.
// Chaque utilisateur ne voit que ses propres sessions, sur son propre appareil.

const KEY = "agile_toolbox_history";
const MAX_ENTRIES = 50; // relevé de 20 à 50 pour laisser de la marge à la fusion lors d'un import

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // localStorage indisponible (navigation privée stricte, quota dépassé...)
    return [];
  }
}

/**
 * Enregistre ou met à jour une entrée d'historique local.
 * @param {{id:string, tool:'poker'|'retro'|'daily'|'kanban', name?:string, role:'host'|'guest'}} entry
 */
export function addLocalSession({ id, tool, name, role }) {
  try {
    const list = readAll().filter(s => !(s.id === id && s.tool === tool));
    list.unshift({ id, tool, name: name || null, role, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // On échoue silencieusement : l'historique local est une commodité,
    // pas une fonctionnalité critique.
  }
}

export function getLocalSessions() {
  return readAll();
}

export function removeLocalSession(id, tool) {
  try {
    const list = readAll().filter(s => !(s.id === id && s.tool === tool));
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* silencieux */ }
}

export function clearLocalSessions() {
  try { localStorage.removeItem(KEY); } catch { /* silencieux */ }
}

// ── Export / import — pour changer d'ordinateur ou de navigateur ───────────
// L'historique local n'existe que dans CE navigateur (voir l'en-tête du
// fichier) : un export/import JSON est le seul moyen de le faire suivre
// d'un appareil à l'autre, puisqu'il n'y a par construction aucun compte
// ni synchronisation serveur pour les outils en mode lien.

export function exportLocalSessionsAsJson() {
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), sessions: readAll() },
    null,
    2
  );
}

// Déclenche le téléchargement d'un fichier .json contenant l'historique
// actuel — à conserver et réimporter sur un autre appareil.
export function downloadLocalSessionsBackup() {
  const data = exportLocalSessionsAsJson();
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agile-toolbox-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Fusionne un export précédent avec l'historique déjà présent sur cet
// appareil (ne l'écrase pas) — utile si l'utilisateur a déjà quelques
// sessions ici et importe un ancien export d'un autre ordinateur. En cas
// de doublon (même id + même outil), on garde la version la plus récente.
// Retourne {importedCount, total} ou lève une erreur si le fichier est
// invalide (message pensé pour être affiché tel quel à l'utilisateur).
export function importLocalSessionsFromJson(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Ce fichier n'est pas un export valide (JSON illisible).");
  }

  const incoming = Array.isArray(parsed) ? parsed : parsed?.sessions;
  if (!Array.isArray(incoming)) {
    throw new Error("Ce fichier ne ressemble pas à un export de sessions Agile Toolbox.");
  }

  const merged = readAll();
  let importedCount = 0;

  for (const entry of incoming) {
    if (!entry || typeof entry.id !== "string" || typeof entry.tool !== "string") continue;
    const clean = {
      id: entry.id.slice(0, 50),
      tool: entry.tool.slice(0, 30),
      name: entry.name ? String(entry.name).slice(0, 200) : null,
      role: entry.role === "host" ? "host" : "guest",
      at: typeof entry.at === "number" ? entry.at : Date.now(),
    };
    const idx = merged.findIndex(s => s.id === clean.id && s.tool === clean.tool);
    if (idx === -1) {
      merged.push(clean);
      importedCount++;
    } else if (clean.at > merged[idx].at) {
      merged[idx] = clean; // on garde la version la plus récente en cas de doublon
    }
  }

  merged.sort((a, b) => b.at - a.at);
  const trimmed = merged.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    throw new Error("Impossible d'enregistrer l'import (stockage local indisponible).");
  }

  return { importedCount, total: trimmed.length };
}
