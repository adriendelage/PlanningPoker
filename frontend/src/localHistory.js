// Historique local des sessions — stocké UNIQUEMENT dans le navigateur.
// Rien n'est jamais envoyé au serveur : ce fichier ne fait aucun appel réseau.
// Chaque utilisateur ne voit que ses propres sessions, sur son propre appareil.

const KEY = "agile_toolbox_history";
const MAX_ENTRIES = 20;

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
