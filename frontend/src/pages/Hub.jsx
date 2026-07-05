import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLocalSessions, removeLocalSession } from "../localHistory";

const TOOLS = [
  {
    id: "poker",
    icon: "🃏",
    suit: "♠",
    name: "Planning Poker",
    desc: "Estimez vos user stories en équipe, en temps réel, avec révélation simultanée des votes.",
    accent: "#00f5d4",
    path: "/poker",
    active: true,
  },
  {
    id: "retro",
    icon: "🔄",
    suit: "♥",
    name: "Rétrospective",
    desc: "Colonnes personnalisables (Start / Stop / Continue…), post-its anonymes et dot-voting.",
    accent: "#f15bb5",
    path: "/retro",
    active: true,
  },
  {
    id: "daily",
    icon: "⏱️",
    suit: "♦",
    name: "Daily Timer",
    desc: "Temps de parole équitable pour le stand-up : rotation des participants et chrono partagé.",
    accent: "#fee440",
    path: "/daily",
    active: true,
  },
  {
    id: "kanban",
    icon: "📋",
    suit: "♣",
    name: "Kanban léger",
    desc: "Un tableau permanent pour suivre le sprint : À faire, En cours, Terminé. Sans la lourdeur de Jira.",
    accent: "#9b5de5",
    path: "/kanban",
    active: true,
  },
  {
    id: "velocity",
    icon: "📈",
    suit: "▲",
    name: "Suivi de vélocité",
    desc: "Points engagés vs livrés, sprint après sprint — pour affiner tes prévisions de capacité.",
    accent: "#00bbf9",
    path: "/velocity",
    active: true,
  },
  {
    id: "okr",
    icon: "🎯",
    suit: "◎",
    name: "OKR léger",
    desc: "Objectifs et résultats clés, avec une progression mise à jour en équipe au fil du cycle.",
    accent: "#ff9f1c",
    path: "/okr",
    active: true,
  },
  {
    id: "gantt",
    icon: "📅",
    suit: "▤",
    name: "Rétro-planning",
    desc: "Tâches, dépendances et chemin critique calculé automatiquement — en mode Gantt.",
    accent: "#e63946",
    path: "/gantt",
    active: true,
  },
  {
    id: "capacity",
    icon: "🧮",
    suit: "≈",
    name: "Planificateur de capacité",
    desc: "Estime la capacité du prochain sprint selon la disponibilité réelle de chaque membre.",
    accent: "#06d6a0",
    path: "/capacity",
    active: true,
  },
  {
    id: "poll",
    icon: "🗳️",
    suit: "?",
    name: "Sondage rapide",
    desc: "Une décision d'équipe en direct : question, options, vote instantané.",
    accent: "#118ab2",
    path: "/poll",
    active: true,
  },
  {
    id: "goal",
    icon: "🚀",
    suit: "↗",
    name: "Objectif de sprint",
    desc: "Un objectif clair par sprint, une confiance mesurée, un historique dans le temps.",
    accent: "#ef476f",
    path: "/goal",
    active: true,
  },
  {
    id: "dod",
    icon: "✅",
    suit: "☑",
    name: "Definition of Done",
    desc: "Une checklist partagée, à cocher avant de considérer une story terminée.",
    accent: "#8ac926",
    path: "/dod",
    active: true,
  },
  {
    id: "decisions",
    icon: "📜",
    suit: "§",
    name: "Journal de décisions",
    desc: "Quoi, pourquoi, par qui — pour ne plus se demander pourquoi six mois plus tard.",
    accent: "#ffca3a",
    path: "/decisions",
    active: true,
  },
  {
    id: "postmortem",
    icon: "🩹",
    suit: "!",
    name: "Post-mortem d'incident",
    desc: "Chronologie, cause racine, actions correctives — un tableau par incident.",
    accent: "#c1121f",
    path: "/postmortem",
    active: true,
  },
  {
    id: "flags",
    icon: "🚩",
    suit: "⚑",
    name: "Suivi de feature flags",
    desc: "Qui a activé quoi, où — pour ne plus perdre le fil des interrupteurs du code.",
    accent: "#6a4c93",
    path: "/flags",
    active: true,
  },
  {
    id: "pulse",
    icon: "💓",
    suit: "♡",
    name: "Pouls d'équipe",
    desc: "Un check-in d'humeur en un clic, chaque jour, avec la tendance dans le temps.",
    accent: "#ff6b9d",
    path: "/pulse",
    active: true,
  },
  {
    id: "wheel",
    icon: "🎡",
    suit: "○",
    name: "Roue de décision",
    desc: "Qui anime le daily ? Qui fait la démo ? Laisse le hasard trancher, sans rien enregistrer.",
    accent: "#00f5d4",
    path: "/wheel",
    active: true,
  },
];

// Où renvoyer l'utilisateur selon l'outil et son rôle lors de sa dernière visite.
// Trois catégories de comportement :
// - JOIN_TOOLS : session éphémère avec une étape "rejoindre" (saisie du nom)
// - HOST_AWARE_NO_JOIN : pas d'étape de jointure (vote anonyme), mais l'hôte
//   garde des actions spécifiques (ex: clôturer le sondage)
// - le reste : tableaux permanents, aucune distinction de rôle dans l'UI,
//   on rouvre toujours le même lien
const JOIN_TOOLS = ["poker", "retro", "daily"];
const HOST_AWARE_NO_JOIN = ["poll"];

function resolveLink(entry) {
  const { id, tool, role } = entry;
  if (JOIN_TOOLS.includes(tool)) {
    return role === "host" ? `/${tool}/${id}?host=true` : `/${tool}/join/${id}`;
  }
  if (HOST_AWARE_NO_JOIN.includes(tool)) {
    return role === "host" ? `/${tool}/${id}?host=true` : `/${tool}/${id}`;
  }
  return `/${tool}/${id}`;
}

const TOOL_META = {
  poker:      { icon: "🃏", accent: "#00f5d4" },
  retro:      { icon: "🔄", accent: "#f15bb5" },
  daily:      { icon: "⏱️", accent: "#fee440" },
  kanban:     { icon: "📋", accent: "#9b5de5" },
  velocity:   { icon: "📈", accent: "#00bbf9" },
  okr:        { icon: "🎯", accent: "#ff9f1c" },
  gantt:      { icon: "📅", accent: "#e63946" },
  capacity:   { icon: "🧮", accent: "#06d6a0" },
  poll:       { icon: "🗳️", accent: "#118ab2" },
  goal:       { icon: "🚀", accent: "#ef476f" },
  dod:        { icon: "✅", accent: "#8ac926" },
  decisions:  { icon: "📜", accent: "#ffca3a" },
  postmortem: { icon: "🩹", accent: "#c1121f" },
  flags:      { icon: "🚩", accent: "#6a4c93" },
  pulse:      { icon: "💓", accent: "#ff6b9d" },
};

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Hub() {
  const nav = useNavigate();
  const [mine, setMine] = useState([]);

  useEffect(() => {
    setMine(getLocalSessions());
  }, []);

  const forget = (e, entry) => {
    e.stopPropagation();
    removeLocalSession(entry.id, entry.tool);
    setMine(list => list.filter(s => !(s.id === entry.id && s.tool === entry.tool)));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "48px 16px" }}>
      <style>{`
        .tool-card { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; cursor: pointer; }
        .tool-card:hover, .tool-card:focus-visible { transform: translateY(-4px); outline: none; }
        .tool-card.soon { cursor: default; opacity: .55; }
        .tool-card.soon:hover { transform: none; }
        .session-row { transition: background .15s ease; cursor: pointer; }
        .session-row:hover { background: #16162a; }
        .session-row:hover .forget-btn { opacity: 1; }
        .forget-btn { opacity: 0; transition: opacity .15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .tool-card, .session-row { transition: none; }
          .tool-card:hover { transform: none; }
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        {/* ── En-tête ── */}
        <header style={{ textAlign: "center", marginBottom: 48, position: "relative" }}>
          <a href="/app" style={{
            position: "absolute", top: 0, right: 0, fontSize: 13, color: "#666",
            textDecoration: "none", border: "1px solid #333", borderRadius: 999, padding: "6px 14px",
          }}>
            🔐 Espace d'équipe
          </a>
          <div style={{ fontSize: 15, letterSpacing: 4, color: "#555", textTransform: "uppercase", marginBottom: 10 }}>
            ♠ ♥ ♦ ♣
          </div>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800 }}>
            Agile <span style={{ color: "#00f5d4" }}>Toolbox</span>
          </h1>
          <p style={{ margin: "10px auto 0", color: "#777", fontSize: 16, maxWidth: 520 }}>
            Les outils de vos cérémonies Agile, réunis au même endroit.
            Sans compte, sans installation — un lien suffit.
          </p>
        </header>

        {/* ── Grille des outils ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginBottom: 56,
        }}>
          {TOOLS.map(tool => (
            <div
              key={tool.id}
              className={`tool-card${tool.active ? "" : " soon"}`}
              role={tool.active ? "button" : undefined}
              tabIndex={tool.active ? 0 : -1}
              onClick={() => tool.active && nav(tool.path)}
              onKeyDown={e => tool.active && e.key === "Enter" && nav(tool.path)}
              style={{
                position: "relative",
                background: "#111",
                border: "1px solid #222",
                borderTop: `3px solid ${tool.accent}`,
                borderRadius: 16,
                padding: "24px 22px",
                overflow: "hidden",
                boxShadow: tool.active ? `0 0 0 0 ${tool.accent}00` : "none",
              }}
            >
              <div style={{
                position: "absolute", right: -8, bottom: -22,
                fontSize: 110, color: tool.accent, opacity: .07,
                pointerEvents: "none", userSelect: "none", lineHeight: 1,
              }}>
                {tool.suit}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 30 }}>{tool.icon}</span>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{tool.name}</h2>
              </div>

              <p style={{ margin: 0, color: "#999", fontSize: 14, lineHeight: 1.55, minHeight: 66 }}>
                {tool.desc}
              </p>

              <div style={{ marginTop: 18 }}>
                {tool.active ? (
                  <span style={{ color: tool.accent, fontSize: 14, fontWeight: 600 }}>
                    Ouvrir →
                  </span>
                ) : (
                  <span style={{
                    fontSize: 12, fontWeight: 600, letterSpacing: .5,
                    color: "#666", border: "1px solid #333",
                    borderRadius: 999, padding: "4px 12px",
                  }}>
                    Bientôt disponible
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Mes sessions (privé — stocké uniquement dans ce navigateur) ── */}
        {mine.length > 0 && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#aaa", letterSpacing: .5, textTransform: "uppercase", marginBottom: 6 }}>
              Mes sessions
            </h2>
            <p style={{ fontSize: 12.5, color: "#555", margin: "0 0 14px" }}>
              🔒 Visible uniquement sur cet appareil — jamais partagé avec qui que ce soit.
            </p>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 16, overflow: "hidden" }}>
              {mine.map((s, i) => {
                const meta = TOOL_META[s.tool] || TOOL_META.poker;
                return (
                  <div
                    key={`${s.tool}:${s.id}`}
                    className="session-row"
                    onClick={() => nav(resolveLink(s))}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 18px",
                      borderTop: i > 0 ? "1px solid #1c1c30" : "none",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.name || `Session ${s.id}`}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#666" }}>
                        {s.role === "host" ? "créée par toi" : "rejointe"} · {fmtDate(s.at)}
                      </div>
                    </div>
                    <button className="forget-btn" onClick={e => forget(e, s)}
                      title="Retirer de mon historique"
                      style={{ background: "none", border: "1px solid #333", borderRadius: 8, color: "#666", fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
                      ✕
                    </button>
                    <span style={{ fontSize: 12, color: meta.accent, border: `1px solid ${meta.accent}33`, borderRadius: 999, padding: "3px 10px" }}>
                      Ouvrir →
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer style={{ textAlign: "center", marginTop: 56, color: "#444", fontSize: 13 }}>
          Outils développés par Mr1Dridri
        </footer>
      </div>
    </div>
  );
}
