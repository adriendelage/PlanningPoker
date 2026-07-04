import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

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
    active: false,
  },
  {
    id: "kanban",
    icon: "📋",
    suit: "♣",
    name: "Kanban léger",
    desc: "Un tableau simple pour suivre le sprint : To do, In progress, Done. Sans la lourdeur de Jira.",
    accent: "#9b5de5",
    active: false,
  },
];

export default function Hub() {
  const nav = useNavigate();
  const [recent, setRecent] = useState([]);
  const [expanded, setExpanded] = useState(null); // id de session dépliée
  const [details, setDetails] = useState({});     // cache des résultats {id: [...]}

  useEffect(() => {
    api.listSessions(8).then(setRecent).catch(() => setRecent([]));
  }, []);

  const toggleDetails = async (s) => {
    if (expanded === s.id) return setExpanded(null);
    setExpanded(s.id);
    if (!details[s.id] && s.results_count > 0) {
      try {
        const full = await api.getSession(s.id);
        setDetails(d => ({ ...d, [s.id]: full.results }));
      } catch { /* silencieux */ }
    }
  };

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "48px 16px" }}>
      <style>{`
        .tool-card { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; cursor: pointer; }
        .tool-card:hover, .tool-card:focus-visible { transform: translateY(-4px); outline: none; }
        .tool-card.soon { cursor: default; opacity: .55; }
        .tool-card.soon:hover { transform: none; }
        .session-row { transition: background .15s ease; cursor: pointer; }
        .session-row:hover { background: #16162a; }
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
              {/* Symbole de carte en filigrane */}
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

        {/* ── Sessions récentes (visible seulement si la base renvoie des données) ── */}
        {recent.length > 0 && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#aaa", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>
              Sessions récentes
            </h2>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 16, overflow: "hidden" }}>
              {recent.map((s, i) => (
                <div key={s.id}>
                  <div
                    className="session-row"
                    onClick={() => s.finished_at
                      ? toggleDetails(s)
                      : nav(s.tool === "retro" ? `/retro/join/${s.id}` : `/join/${s.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14,
                      padding: "14px 18px",
                      borderTop: i > 0 ? "1px solid #1c1c30" : "none",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{s.tool === "retro" ? "🔄" : "🃏"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.name || `Session ${s.id}`}
                      </div>
                      <div style={{ fontSize: 12.5, color: "#666" }}>
                        {s.host_name ? `par ${s.host_name} · ` : ""}{fmtDate(s.created_at)} · {s.task_count} {s.tool === "retro" ? "note" : "tâche"}{s.task_count > 1 ? "s" : ""}
                      </div>
                    </div>
                    {s.finished_at ? (
                      <span style={{ fontSize: 12, color: "#00f5d4", border: "1px solid #00f5d433", borderRadius: 999, padding: "3px 10px" }}>
                        Terminée {expanded === s.id ? "▴" : "▾"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "#fee440", border: "1px solid #fee44033", borderRadius: 999, padding: "3px 10px" }}>
                        Rejoindre →
                      </span>
                    )}
                  </div>

                  {/* Résultats dépliés */}
                  {expanded === s.id && (
                    <div style={{ padding: "4px 18px 16px 50px", borderTop: "1px dashed #1c1c30" }}>
                      {(details[s.id] || []).length === 0 ? (
                        <p style={{ color: "#555", fontSize: 13, margin: "10px 0 0" }}>Rien n'a été enregistré pour cette session.</p>
                      ) : s.tool === "retro" ? (
                        details[s.id].map((r, j) => (
                          <div key={j} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #1a1a2e", fontSize: 14 }}>
                            <span style={{ color: "#f15bb5", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{r.column_name}</span>
                            <span style={{ flex: 1, color: "#ccc" }}>{r.content}</span>
                            {r.votes > 0 && <span style={{ color: "#f15bb5", fontWeight: 700, whiteSpace: "nowrap" }}>{r.votes} ●</span>}
                          </div>
                        ))
                      ) : (
                        details[s.id].map(r => (
                          <div key={r.task_index} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a2e", fontSize: 14 }}>
                            <span style={{ color: "#ccc" }}>{r.task}</span>
                            <span style={{ color: "#00f5d4", fontWeight: 700 }}>{r.median ?? "—"} pts</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{ textAlign: "center", marginTop: 56, color: "#444", fontSize: 13 }}>
          Agile Toolbox — open source ·{" "}
          <a href="https://github.com/adriendelage/PlanningPoker" style={{ color: "#555" }}>GitHub</a>
        </footer>
      </div>
    </div>
  );
}
