import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#00bbf9";
const COMMITTED_COLOR = "#2a3a4a";

// ─── Graphique en barres (SVG fait main, sans dépendance externe) ───────────
function VelocityChart({ sprints }) {
  const W = 640, H = 260;
  const padL = 40, padR = 16, padT = 16, padB = 36;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const maxVal = Math.max(1, ...sprints.flatMap(s => [s.committed, s.completed]));
  const barGroupW = chartW / sprints.length;
  const barW = Math.min(28, barGroupW * 0.32);

  const avg = sprints.length
    ? Math.round(sprints.reduce((a, s) => a + s.completed, 0) / sprints.length)
    : 0;
  const avgY = padT + chartH - (avg / maxVal) * chartH;

  const yTo = v => padT + chartH - (v / maxVal) * chartH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={W - padR} y1={padT + chartH * (1 - f)} y2={padT + chartH * (1 - f)}
          stroke="#1c1c30" strokeWidth="1" />
      ))}

      {sprints.length > 0 && (
        <>
          <line x1={padL} x2={W - padR} y1={avgY} y2={avgY} stroke={ACCENT} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.8" />
          <text x={W - padR} y={avgY - 6} textAnchor="end" fontSize="11" fill={ACCENT} fontWeight="700">
            moy. {avg} pts
          </text>
        </>
      )}

      {sprints.map((s, i) => {
        const cx = padL + barGroupW * i + barGroupW / 2;
        const hCommitted = (s.committed / maxVal) * chartH;
        const hCompleted = (s.completed / maxVal) * chartH;
        return (
          <g key={s.id}>
            <rect x={cx - barW - 2} y={yTo(s.committed)} width={barW} height={hCommitted}
              fill={COMMITTED_COLOR} rx="3" />
            <rect x={cx + 2} y={yTo(s.completed)} width={barW} height={hCompleted}
              fill={ACCENT} rx="3" />
            <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#777">
              {s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Velocity() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", committed: "", completed: "" });

  useEffect(() => {
    socket.emit("velocity:open", { id });
    socket.on("velocity:state", setState);
    socket.on("velocity:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("velocity:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("velocity:state", setState);
      socket.off("velocity:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "velocity");
    addLocalSession({ id, tool: "velocity", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const addSprint = () => {
    if (!form.name.trim()) return;
    socket.emit("velocity:sprint:add", {
      id,
      sprintName: form.name,
      committed: form.committed,
      completed: form.completed,
    });
    setForm({ name: "", committed: "", completed: "" });
  };

  const del = (sprintId) => socket.emit("velocity:sprint:delete", { id, sprintId });

  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats = useMemo(() => {
    if (!state || state.sprints.length === 0) return null;
    const last3 = state.sprints.slice(-3);
    const avg3 = Math.round(last3.reduce((a, s) => a + s.completed, 0) / last3.length);
    const totalCompleted = state.sprints.reduce((a, s) => a + s.completed, 0);
    const totalCommitted = state.sprints.reduce((a, s) => a + s.committed, 0);
    const reliability = totalCommitted > 0 ? Math.round((totalCompleted / totalCommitted) * 100) : null;
    return { avg3, totalCompleted, reliability };
  }, [state]);

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Tableau introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le tableau a été créé sans base de données.</p>
          <a href="/velocity" style={{ color: "#00bbf9" }}>Créer un nouveau tableau</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture du tableau…
      </div>
    );
  }

  const inputStyle = {
    padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444",
    borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            📈 {state.name || "Vélocité"}
          </h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le tableau"}
          </button>
        </header>

        {stats && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 18px", flex: "1 1 160px" }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Vélocité moyenne (3 derniers)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{stats.avg3} pts</div>
            </div>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 18px", flex: "1 1 160px" }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Total livré</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.totalCompleted} pts</div>
            </div>
            {stats.reliability != null && (
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 18px", flex: "1 1 160px" }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Fiabilité d'engagement</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: stats.reliability >= 80 ? "#00f5d4" : stats.reliability >= 50 ? "#fee440" : "#ff4444" }}>
                  {stats.reliability}%
                </div>
              </div>
            )}
          </div>
        )}

        {state.sprints.length > 0 ? (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 16px", marginBottom: 22 }}>
            <VelocityChart sprints={state.sprints} />
            <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontSize: 12.5, color: "#888" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: COMMITTED_COLOR, borderRadius: 2, marginRight: 6 }} />Engagé</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: ACCENT, borderRadius: 2, marginRight: 6 }} />Livré</span>
            </div>
          </div>
        ) : (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "32px 16px", marginBottom: 22, textAlign: "center", color: "#555" }}>
            Ajoute un premier sprint pour voir apparaître le graphique.
          </div>
        )}

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>Ajouter un sprint</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Nom du sprint (ex: Sprint 12)" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, flex: "2 1 180px" }} />
            <input placeholder="Points engagés" type="number" min="0" value={form.committed}
              onChange={e => setForm(f => ({ ...f, committed: e.target.value }))}
              style={{ ...inputStyle, flex: "1 1 100px" }} />
            <input placeholder="Points livrés" type="number" min="0" value={form.completed}
              onChange={e => setForm(f => ({ ...f, completed: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addSprint()}
              style={{ ...inputStyle, flex: "1 1 100px" }} />
            <button onClick={addSprint}
              style={{ padding: "10px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 14 }}>
              + Ajouter
            </button>
          </div>
        </div>

        {state.sprints.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
            {[...state.sprints].reverse().map((s, i) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 18px",
                borderTop: i > 0 ? "1px solid #1c1c30" : "none",
              }}>
                <span style={{ flex: 1, fontSize: 14.5, color: "#ddd" }}>{s.name}</span>
                <span style={{ fontSize: 13, color: "#666" }}>engagé <strong style={{ color: "#999" }}>{s.committed}</strong></span>
                <span style={{ fontSize: 13, color: "#666" }}>livré <strong style={{ color: ACCENT }}>{s.completed}</strong></span>
                <button onClick={() => del(s.id)}
                  style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
