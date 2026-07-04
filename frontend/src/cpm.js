// Méthode du Chemin Critique (CPM — Critical Path Method).
//
// Fonction PURE : à graphe de tâches identique, le résultat est identique
// pour tout le monde. C'est pourquoi ce calcul se fait côté client plutôt
// que sur le serveur — le serveur se contente de stocker et diffuser les
// tâches et leurs dépendances brutes (voir server.js, événements "gantt:*").
//
// Entrée : tasks = [{ id, name, duration, dependsOn: [id, id, ...] }]
// Sortie : {
//   tasks: [...tasks, { es, ef, ls, lf, slack, critical }],
//   projectDuration: nombre total de jours du projet,
//   criticalPath: [nom, nom, ...] dans l'ordre du chemin critique,
//   error: null | "cycle"
// }
//
// Vocabulaire :
//   ES = Earliest Start  (date de début au plus tôt)
//   EF = Earliest Finish (date de fin au plus tôt)   = ES + durée
//   LS = Latest Start    (date de début au plus tard)
//   LF = Latest Finish   (date de fin au plus tard)
//   slack (marge) = LS - ES. Une tâche à marge nulle est sur le chemin
//   critique : le moindre retard sur cette tâche retarde tout le projet.

export function computeCPM(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]));

  // ── 1. Détection de cycle (DFS à 3 couleurs) ──────────────────────────────
  // Une dépendance circulaire (A dépend de B qui dépend de A) rend le
  // calcul des dates impossible : on le détecte et on remonte une erreur
  // plutôt que de boucler à l'infini ou de renvoyer un résultat incohérent.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map(t => [t.id, WHITE]));
  let hasCycle = false;

  function visit(id) {
    if (hasCycle) return;
    color.set(id, GRAY);
    const t = byId.get(id);
    for (const depId of t.dependsOn) {
      if (!byId.has(depId)) continue; // dépendance vers une tâche supprimée : ignorée
      const c = color.get(depId);
      if (c === GRAY) { hasCycle = true; return; }
      if (c === WHITE) visit(depId);
    }
    color.set(id, BLACK);
  }
  tasks.forEach(t => { if (color.get(t.id) === WHITE) visit(t.id); });

  if (hasCycle) {
    return {
      error: "cycle",
      tasks: tasks.map(t => ({ ...t, es: 0, ef: t.duration, ls: 0, lf: t.duration, slack: 0, critical: false })),
      projectDuration: 0,
      criticalPath: [],
    };
  }

  // ── 2. Tri topologique (algorithme de Kahn) ───────────────────────────────
  const successors = new Map(tasks.map(t => [t.id, []]));
  tasks.forEach(t => t.dependsOn.forEach(depId => {
    if (successors.has(depId)) successors.get(depId).push(t.id);
  }));
  const indegree = new Map(tasks.map(t => [t.id, t.dependsOn.filter(d => byId.has(d)).length]));
  const queue = tasks.filter(t => indegree.get(t.id) === 0).map(t => t.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const succ of successors.get(id)) {
      indegree.set(succ, indegree.get(succ) - 1);
      if (indegree.get(succ) === 0) queue.push(succ);
    }
  }

  // ── 3. Passe avant : dates au plus tôt (ES / EF) ──────────────────────────
  const ES = new Map(), EF = new Map();
  order.forEach(id => {
    const t = byId.get(id);
    const preds = t.dependsOn.filter(d => byId.has(d));
    const es = preds.length ? Math.max(...preds.map(d => EF.get(d))) : 0;
    ES.set(id, es);
    EF.set(id, es + t.duration);
  });

  const projectDuration = order.length ? Math.max(...order.map(id => EF.get(id))) : 0;

  // ── 4. Passe arrière : dates au plus tard (LS / LF) ───────────────────────
  const LF = new Map(), LS = new Map();
  [...order].reverse().forEach(id => {
    const succs = successors.get(id);
    const lf = succs.length ? Math.min(...succs.map(s => LS.get(s))) : projectDuration;
    LF.set(id, lf);
    LS.set(id, lf - byId.get(id).duration);
  });

  // ── 5. Marge et chemin critique ────────────────────────────────────────────
  const result = tasks.map(t => {
    const es = ES.get(t.id) ?? 0;
    const ef = EF.get(t.id) ?? t.duration;
    const ls = LS.get(t.id) ?? 0;
    const lf = LF.get(t.id) ?? t.duration;
    const slack = ls - es;
    return { ...t, es, ef, ls, lf, slack, critical: slack === 0 };
  });

  const criticalPath = order
    .filter(id => result.find(t => t.id === id)?.critical)
    .map(id => byId.get(id).name);

  return { tasks: result, projectDuration, criticalPath, error: null };
}
