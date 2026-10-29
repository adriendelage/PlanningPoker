// Modèles prêts à poser sur le tableau blanc. Chaque modèle fabrique une liste
// d'éléments positionnés autour de (0,0) ; la page les recentre sur la vue.
import { RETRO_TEMPLATES } from "../retroTemplates";

const C = { green: "#8ac926", red: "#ff6b6b", blue: "#4cc9f0", yellow: "#fee440", pink: "#f15bb5", purple: "#c8a2ff", orange: "#ff9f1c", teal: "#00f5d4", white: "#ffffff", grey: "#9aa7b8" };
const PALETTE = [C.green, C.red, C.blue, C.yellow, C.pink, C.purple, C.orange, C.teal];

const frame = (x, y, w, h, title, color = C.blue) => ({ type: "frame", x, y, w, h, text: title, color, fs: 18 });
const sticky = (x, y, text, color = C.yellow, w = 150, h = 110) => ({ type: "sticky", x, y, w, h, text, color, fs: 16 });
const text = (x, y, t, fs = 22, color = C.white, w = 460, h = 44) => ({ type: "text", x, y, w, h, text: t, color, fs });
const shape = (type, x, y, w, h, t, color = C.blue) => ({ type, x, y, w, h, text: t, color, fs: 16 });
const line = (type, x, y, dx, dy, color = C.grey, size = 3) => ({ type, x, y, points: [0, 0, dx, dy], color, size });
const emoji = (x, y, e, size = 64) => ({ type: "emoji", x, y, w: size * 1.2, h: size * 1.2, text: e, color: C.white, fs: size });
const table = (x, y, w, h, t, color = C.blue) => ({ type: "table", x, y, w, h, text: t, color, fs: 15 });
const chart = (kind, x, y, w, h, t) => ({ type: "chart", kind, x, y, w, h, text: t, color: C.blue, fs: 14 });

// Colonnes côte à côte (rétros, kanban, roadmap…)
function columns(title, names, { w = 340, gap = 36, h = 520, withSticky = false } = {}) {
  const out = [text(0, -90, title, 28, C.white, Math.max(400, names.length * (w + gap)))];
  names.forEach((n, i) => {
    out.push(frame(i * (w + gap), 0, w, h, n, PALETTE[i % PALETTE.length]));
    if (withSticky) out.push(sticky(i * (w + gap) + 20, 70, "Exemple de carte", PALETTE[i % PALETTE.length]));
  });
  return out;
}

// Matrice 2×2 avec axes
function matrix(title, [tl, tr, bl, br], xAxis, yAxis) {
  const w = 420, h = 320, gap = 28;
  return [
    text(0, -100, title, 28),
    text(0, -48, "↑ " + yAxis, 15, C.grey, 600, 30),
    frame(0, 0, w, h, tl[0], tl[1]), frame(w + gap, 0, w, h, tr[0], tr[1]),
    frame(0, h + gap, w, h, bl[0], bl[1]), frame(w + gap, h + gap, w, h, br[0], br[1]),
    text(0, 2 * h + gap + 14, xAxis, 15, C.grey, 2 * w + gap, 30),
  ];
}

const retroTemplates = RETRO_TEMPLATES.map(t => ({
  id: "retro-" + t.id, category: "retro", icon: t.icon, name: t.name, desc: t.desc,
  build: () => columns(t.name, t.columns, { w: t.columns.length >= 5 ? 280 : t.columns.length === 4 ? 310 : 360, h: 520 }),
}));

const others = [
  // ── Planification ──────────────────────────────────────────────────────────
  { id: "kanban", category: "plan", icon: "📋", name: "Kanban", desc: "À faire, En cours, Terminé — avec une carte d'exemple.",
    build: () => columns("Kanban", ["📝 À faire", "🚧 En cours", "✅ Terminé"], { withSticky: true }) },
  { id: "sprint", category: "plan", icon: "🏃", name: "Tableau de sprint", desc: "Backlog, sprint, en cours, en revue et terminé.",
    build: () => columns("Tableau de sprint", ["📦 Backlog", "🎯 Sprint", "🚧 En cours", "👀 En revue", "✅ Terminé"], { w: 280 }) },
  { id: "roadmap", category: "plan", icon: "🗺️", name: "Roadmap Now · Next · Later", desc: "Prioriser selon l'horizon de temps.",
    build: () => columns("Roadmap", ["⚡ Maintenant", "👉 Ensuite", "🌅 Plus tard"], { withSticky: true }) },
  { id: "moscow", category: "plan", icon: "🧮", name: "Priorisation MoSCoW", desc: "Must, Should, Could, Won't have.",
    build: () => columns("Priorisation MoSCoW", ["🔴 Must have", "🟠 Should have", "🟡 Could have", "⚪ Won't have"], { w: 310 }) },
  { id: "impact", category: "plan", icon: "🎯", name: "Matrice Impact / Effort", desc: "Repérer les quick wins et les projets à éviter.",
    build: () => matrix("Matrice Impact / Effort", [["🏆 Gros projets (impact fort, effort fort)", C.orange], ["⚡ Quick wins (impact fort, effort faible)", C.green], ["🗑️ À éviter (impact faible, effort fort)", C.red], ["🙂 Bonus (impact faible, effort faible)", C.blue]], "Effort →", "Impact") },
  { id: "eisenhower", category: "plan", icon: "⏳", name: "Matrice d'Eisenhower", desc: "Urgent / important : décider quoi faire, planifier, déléguer ou éliminer.",
    build: () => matrix("Matrice d'Eisenhower", [["📅 Planifier (important, pas urgent)", C.blue], ["🔥 Faire (important et urgent)", C.red], ["🗑️ Éliminer (ni urgent ni important)", C.grey], ["🤝 Déléguer (urgent, pas important)", C.orange]], "Urgence →", "Importance") },
  { id: "timeline", category: "plan", icon: "📅", name: "Frise chronologique", desc: "Six jalons sur une ligne de temps.",
    build: () => {
      const out = [text(0, -90, "Frise chronologique", 28), line("arrow", 0, 200, 1400, 0, C.grey, 4)];
      for (let i = 0; i < 6; i++) {
        const x = 70 + i * 215;
        out.push(shape("ellipse", x, 180, 40, 40, "", PALETTE[i % PALETTE.length]));
        out.push(i % 2 === 0 ? sticky(x - 55, 30, "Jalon " + (i + 1), PALETTE[i % PALETTE.length]) : sticky(x - 55, 250, "Jalon " + (i + 1), PALETTE[i % PALETTE.length]));
      }
      return out;
    } },
  { id: "release", category: "plan", icon: "🚢", name: "Plan de release (tableau)", desc: "Un tableau modifiable pour suivre versions, dates et contenu.",
    build: () => [text(0, -90, "Plan de release", 28), table(0, 0, 760, 220, "Version | Date | Contenu | Statut\nv1.0 | 15/01 | MVP | ✅ Livrée\nv1.1 | 12/02 | Correctifs | 🚧 En cours\nv2.0 | 30/04 | Refonte | 📝 Prévue", C.blue)] },

  // ── Stratégie & recherche ──────────────────────────────────────────────────
  { id: "swot", category: "strategy", icon: "🧭", name: "SWOT", desc: "Forces, faiblesses, opportunités, menaces.",
    build: () => matrix("Analyse SWOT", [["💪 Forces", C.green], ["🌱 Opportunités", C.blue], ["🕳️ Faiblesses", C.orange], ["⚠️ Menaces", C.red]], "Interne (gauche) · Externe (droite)", "Positif (haut) · Négatif (bas)") },
  { id: "proscons", category: "strategy", icon: "⚖️", name: "Pour / Contre", desc: "Peser une décision en deux colonnes.",
    build: () => columns("Pour / Contre", ["👍 Pour", "👎 Contre"], { w: 420, h: 480 }) },
  { id: "empathy", category: "strategy", icon: "🧠", name: "Carte d'empathie", desc: "Comprendre un utilisateur : ce qu'il pense, voit, entend, dit, ses peines et ses gains.",
    build: () => {
      const w = 340, h = 250, g = 28;
      return [
        text(0, -90, "Carte d'empathie", 28),
        frame(0, 0, w, h, "💭 Pense et ressent", C.purple), frame(w + g, 0, w, h, "👀 Voit", C.blue), frame(2 * (w + g), 0, w, h, "👂 Entend", C.teal),
        frame(0, h + g, w, h, "🗣️ Dit et fait", C.yellow), frame(w + g, h + g, w, h, "😣 Peines", C.red), frame(2 * (w + g), h + g, w, h, "🎁 Gains", C.green),
      ];
    } },
  { id: "persona", category: "strategy", icon: "🧑", name: "Persona", desc: "Profil, objectifs, frustrations et citation.",
    build: () => [
      text(0, -90, "Persona", 28),
      frame(0, 0, 360, 260, "🧑 Profil", C.blue), frame(396, 0, 360, 260, "🎯 Objectifs", C.green),
      frame(0, 296, 360, 260, "😤 Frustrations", C.red), frame(396, 296, 360, 260, "💬 Citation", C.yellow),
    ] },
  { id: "whys", category: "strategy", icon: "❓", name: "5 pourquoi", desc: "Remonter à la cause racine d'un problème.",
    build: () => {
      const out = [text(0, -90, "Les 5 pourquoi", 28), sticky(0, 0, "Problème observé", C.red, 190, 120)];
      for (let i = 1; i <= 5; i++) {
        out.push(line("arrow", 190 + (i - 1) * 250, 60, 50, 0, C.grey));
        out.push(sticky(i * 250 - 10 + 0, 0, "Pourquoi " + i + " ?", i === 5 ? C.green : C.yellow, 190, 120));
      }
      return out;
    } },
  { id: "compare", category: "strategy", icon: "🆚", name: "Comparatif d'options", desc: "Tableau de décision avec critères.",
    build: () => [text(0, -90, "Comparatif d'options", 28), table(0, 0, 780, 240, "Critère | Option A | Option B | Option C\nCoût | | | \nDélai | | | \nRisque | | | \nTotal | | | ", C.purple)] },

  // ── Diagrammes ─────────────────────────────────────────────────────────────
  { id: "flow", category: "diagram", icon: "🔀", name: "Organigramme (flux)", desc: "Début, étapes, décision et fin avec des flèches.",
    build: () => [
      shape("ellipse", 0, 0, 160, 70, "Début", C.green),
      line("arrow", 160, 35, 60, 0), shape("rect", 220, 0, 170, 70, "Étape 1", C.blue),
      line("arrow", 390, 35, 60, 0), shape("diamond", 450, -25, 190, 120, "Décision ?", C.yellow),
      line("arrow", 640, 35, 60, 0), text(642, -2, "Oui", 14, C.grey, 50, 26), shape("rect", 700, 0, 170, 70, "Étape 2", C.blue),
      line("arrow", 545, 95, 0, 70), text(552, 108, "Non", 14, C.grey, 50, 26), shape("rect", 460, 165, 170, 70, "Étape alternative", C.orange),
      line("arrow", 870, 35, 60, 0), shape("ellipse", 930, 0, 160, 70, "Fin", C.red),
    ] },
  { id: "mindmap", category: "diagram", icon: "🕸️", name: "Carte mentale", desc: "Une idée centrale et quatre branches.",
    build: () => [
      line("line", 280, 140, -150, -90, C.grey), line("line", 400, 140, 170, -90, C.grey), line("line", 280, 200, -150, 100, C.grey), line("line", 400, 200, 170, 100, C.grey),
      shape("ellipse", 230, 110, 220, 120, "Idée centrale", C.pink),
      shape("rect", -60, 20, 190, 60, "Branche 1", C.blue), shape("rect", 560, 20, 190, 60, "Branche 2", C.green),
      shape("rect", -60, 270, 190, 60, "Branche 3", C.orange), shape("rect", 560, 270, 190, 60, "Branche 4", C.purple),
    ] },
  { id: "orgchart", category: "diagram", icon: "🏢", name: "Organigramme d'équipe", desc: "Un responsable, trois équipes.",
    build: () => [
      shape("rect", 280, 0, 220, 70, "Responsable", C.purple),
      line("line", 390, 70, 0, 50), line("line", 90, 120, 600, 0), line("line", 90, 120, 0, 40), line("line", 390, 120, 0, 40), line("line", 690, 120, 0, 40),
      shape("rect", 0, 160, 180, 64, "Équipe A", C.blue), shape("rect", 300, 160, 180, 64, "Équipe B", C.green), shape("rect", 600, 160, 180, 64, "Équipe C", C.orange),
    ] },
  { id: "journey", category: "diagram", icon: "🛤️", name: "Parcours utilisateur", desc: "Cinq étapes, avec actions et émotions.",
    build: () => {
      const out = [text(0, -90, "Parcours utilisateur", 28)];
      ["Découverte", "Essai", "Achat", "Usage", "Recommandation"].forEach((n, i) => {
        out.push(frame(i * 250, 0, 220, 360, n, PALETTE[i % PALETTE.length]));
        if (i < 4) out.push(line("arrow", i * 250 + 222, -20, 26, 0, C.grey));
      });
      return out;
    } },

  // ── Graphiques ─────────────────────────────────────────────────────────────
  { id: "dash", category: "charts", icon: "📊", name: "Tableau de bord", desc: "Trois graphiques : barres, camembert et courbe, avec des données à modifier.",
    build: () => [
      text(0, -90, "Tableau de bord", 28),
      chart("bar", 0, 0, 460, 300, "# Livraisons par sprint\nS1: 12\nS2: 18\nS3: 15\nS4: 22"),
      chart("pie", 490, 0, 460, 300, "# Répartition du temps\nDev: 55\nRéunions: 20\nSupport: 15\nAutre: 10"),
      chart("line", 0, 330, 950, 300, "# Vélocité\nS1: 21\nS2: 25\nS3: 23\nS4: 30\nS5: 34\nS6: 32"),
    ] },
  { id: "kpi", category: "charts", icon: "📈", name: "Suivi d'indicateurs", desc: "Un tableau d'indicateurs et un graphique en anneau.",
    build: () => [
      text(0, -90, "Suivi d'indicateurs", 28),
      table(0, 0, 480, 220, "Indicateur | Cible | Actuel\nBugs ouverts | < 20 | 27\nCouverture tests | 80 % | 72 %\nDélai de livraison | 3 j | 4 j", C.teal),
      chart("donut", 520, -20, 420, 260, "# Avancement\nTerminé: 62\nEn cours: 25\nÀ faire: 13"),
    ] },

  // ── Animation d'atelier ────────────────────────────────────────────────────
  { id: "mood", category: "anim", icon: "😀", name: "Météo d'humeur", desc: "Un brise-glace : chacun place son pion sur la météo du jour.",
    build: () => {
      const out = [text(0, -90, "Quelle est ta météo aujourd'hui ?", 28, C.white, 700), frame(0, 0, 760, 220, "Météo d'équipe", C.blue)];
      ["☀️", "🌤️", "☁️", "🌧️", "⛈️"].forEach((e, i) => out.push(emoji(40 + i * 140, 70, e, 72)));
      return out;
    } },
  { id: "roti", category: "anim", icon: "⭐", name: "ROTI : retour sur investissement du temps", desc: "Chacun note la réunion de 1 à 5.",
    build: () => {
      const out = [text(0, -90, "ROTI — Cette réunion valait-elle le coup ?", 28, C.white, 800)];
      for (let i = 1; i <= 5; i++) out.push(frame((i - 1) * 190, 0, 170, 300, "⭐".repeat(i), PALETTE[i % PALETTE.length]));
      return out;
    } },
  { id: "dots", category: "anim", icon: "🔵", name: "Vote par points", desc: "Un cadre d'idées et un cadre de votes (poser des pastilles).",
    build: () => [
      text(0, -90, "Vote par points", 28),
      frame(0, 0, 600, 420, "💡 Idées", C.yellow), frame(640, 0, 300, 420, "🔵 Pastilles (3 par personne)", C.blue),
      emoji(670, 70, "🔵", 44), emoji(740, 70, "🔵", 44), emoji(810, 70, "🔵", 44),
    ] },
  { id: "teams", category: "anim", icon: "👥", name: "Travail en sous-groupes", desc: "Quatre espaces pour des groupes de travail.",
    build: () => [text(0, -90, "Sous-groupes", 28), frame(0, 0, 440, 320, "Groupe 1", C.blue), frame(470, 0, 440, 320, "Groupe 2", C.green), frame(0, 350, 440, 320, "Groupe 3", C.orange), frame(470, 350, 440, 320, "Groupe 4", C.pink)] },
];

export const WB_TEMPLATES = [...retroTemplates, ...others];

export const WB_TEMPLATE_CATEGORIES = [
  { id: "all", label: "Tous" },
  { id: "retro", label: "Rétrospectives" },
  { id: "plan", label: "Planification" },
  { id: "strategy", label: "Stratégie" },
  { id: "diagram", label: "Diagrammes" },
  { id: "charts", label: "Graphiques" },
  { id: "anim", label: "Animation" },
];
