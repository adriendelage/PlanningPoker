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
];

// Où renvoyer l'utilisateur selon l'outil et son rôle lors de sa dernière visite.
// Kanban, Vélocité et OKR n'ont pas d'étape « rejoindre » : on rouvre
// toujours le tableau directement, quel que soit le rôle.
const PERMANENT_TOOLS = ["kanban", "velocity", "okr", "gantt"];
function resolveLink(entry) {
  const { id, tool, role } = entry;
  if (PERMANENT_TOOLS.includes(tool)) return `/${tool}/${id}`;
  if (role === "host") return `/${tool}/${id}?host=true`;
  return `/${tool}/join/${id}`;
}

const TOOL_META = {
  poker:    { icon: "🃏", accent: "#00f5d4" },
  retro:    { icon: "🔄", accent: "#f15bb5" },
  daily:    { icon: "⏱️", accent: "#fee440" },
  kanban:   { icon: "📋", accent: "#9b5de5" },
  velocity: { icon: "📈", accent: "#00bbf9" },
  okr:      { icon: "🎯", accent: "#ff9f1c" },
  gantt:    { icon: "📅", accent: "#e63946" },
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
        <header style={{ textAlign: "center", marginBottom: 48 }}>
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
