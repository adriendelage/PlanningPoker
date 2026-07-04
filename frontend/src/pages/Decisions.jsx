import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#ffca3a";
const STATUS_COLOR = { "proposée": "#00bbf9", "acceptée": "#8ac926", "obsolète": "#666" };

export default function Decisions() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ title: "", context: "", decidedBy: "" });

  useEffect(() => {
    socket.emit("decisions:open", { id });
    socket.on("decisions:state", setState);
    socket.on("decisions:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("decisions:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("decisions:state", setState);
      socket.off("decisions:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "decisions");
    addLocalSession({ id, tool: "decisions", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const add = () => {
    if (!form.title.trim()) return alert("Donne un titre à la décision");
    socket.emit("decisions:add", { id, ...form });
    setForm({ title: "", context: "", decidedBy: "" });
  };
  const setStatus = (decisionId, status) => socket.emit("decisions:status", { id, decisionId, status });
  const del = (decisionId) => socket.emit("decisions:delete", { id, decisionId });
  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Journal introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le journal a été créé sans base de données.</p>
          <a href="/decisions" style={{ color: ACCENT }}>Créer un nouveau journal</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture du journal…
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>📜 {state.name || "Journal de décisions"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </header>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#aaa" }}>Nouvelle décision</h2>
          <input placeholder="Titre (ex: Choix de PostgreSQL plutôt que MongoDB)" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
          <textarea placeholder="Contexte et raisons de ce choix…" value={form.context} rows={3}
            onChange={e => setForm(f => ({ ...f, context: e.target.value }))}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "none", marginBottom: 10, fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Décidé par (optionnel)" value={form.decidedBy}
              onChange={e => setForm(f => ({ ...f, decidedBy: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={add}
              style={{ padding: "0 20px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 14 }}>
              + Ajouter
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {state.decisions.map(d => (
            <div key={d.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{d.title}</h3>
                <button onClick={() => del(d.id)}
                  style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
              {d.context && <p style={{ margin: "0 0 10px", fontSize: 14, color: "#999", lineHeight: 1.5 }}>{d.context}</p>}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {["proposée", "acceptée", "obsolète"].map(s => (
                  <button key={s} onClick={() => setStatus(d.id, s)}
                    style={{
                      fontSize: 11.5, padding: "3px 11px", borderRadius: 999, cursor: "pointer", fontWeight: 600,
                      background: d.status === s ? `${STATUS_COLOR[s]}22` : "#1a1a2e",
                      border: `1px solid ${d.status === s ? STATUS_COLOR[s] : "#333"}`,
                      color: d.status === s ? STATUS_COLOR[s] : "#666",
                    }}>{s}</button>
                ))}
                {d.decidedBy && <span style={{ fontSize: 12, color: "#555", marginLeft: "auto" }}>par {d.decidedBy}</span>}
              </div>
            </div>
          ))}
          {state.decisions.length === 0 && (
            <p style={{ color: "#555", fontSize: 13, textAlign: "center" }}>Aucune décision enregistrée pour l'instant.</p>
          )}
        </div>

      </div>
    </div>
  );
}
