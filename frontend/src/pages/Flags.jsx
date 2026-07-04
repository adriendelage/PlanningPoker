import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#6a4c93";
const ENV_COLOR = { dev: "#00bbf9", staging: "#fee440", prod: "#ff4444" };

function FlagRow({ flag, onToggle, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState(flag.owner || "");
  const [notes, setNotes] = useState(flag.notes || "");
  const [env, setEnv] = useState(flag.environment);

  const save = () => {
    onUpdate(flag.id, { environment: env, owner, notes });
    setEditing(false);
  };

  return (
    <div style={{ padding: "14px 18px", borderTop: "1px solid #1c1c30" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => onToggle(flag.id)}
          style={{
            width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
            background: flag.active ? "#00f5d4" : "#333", transition: "background .15s ease", flexShrink: 0,
          }}>
          <span style={{
            position: "absolute", top: 2, left: flag.active ? 20 : 2, width: 20, height: 20,
            borderRadius: "50%", background: "#0d0d1a", transition: "left .15s ease",
          }} />
        </button>
        <span style={{ flex: 1, fontSize: 15, color: "#ddd", fontFamily: "monospace" }}>{flag.name}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: ENV_COLOR[flag.environment], border: `1px solid ${ENV_COLOR[flag.environment]}55`, borderRadius: 999, padding: "2px 9px" }}>
          {flag.environment}
        </span>
        <button onClick={() => setEditing(e => !e)} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer" }}>
          {editing ? "▲" : "✎"}
        </button>
        <button onClick={() => onDelete(flag.id)} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
      </div>
      {(flag.owner || flag.notes) && !editing && (
        <div style={{ marginTop: 6, marginLeft: 54, fontSize: 12.5, color: "#666" }}>
          {flag.owner && <span>par {flag.owner}</span>}{flag.owner && flag.notes && " · "}{flag.notes}
        </div>
      )}
      {editing && (
        <div style={{ marginTop: 10, marginLeft: 54, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={env} onChange={e => setEnv(e.target.value)}
            style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13 }}>
            <option value="dev">dev</option>
            <option value="staging">staging</option>
            <option value="prod">prod</option>
          </select>
          <input placeholder="Propriétaire" value={owner} onChange={e => setOwner(e.target.value)}
            style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13, flex: "1 1 120px" }} />
          <input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)}
            style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#fff", padding: "6px 8px", fontSize: 13, flex: "2 1 160px" }} />
          <button onClick={save} style={{ background: ACCENT, border: "none", borderRadius: 6, color: "#fff", padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

export default function Flags() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", environment: "dev", owner: "", notes: "" });

  useEffect(() => {
    socket.emit("flags:open", { id });
    socket.on("flags:state", setState);
    socket.on("flags:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("flags:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("flags:state", setState);
      socket.off("flags:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "flags");
    addLocalSession({ id, tool: "flags", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const add = () => {
    if (!form.name.trim()) return;
    socket.emit("flags:add", { id, ...form });
    setForm({ name: "", environment: "dev", owner: "", notes: "" });
  };
  const toggle = (flagId) => socket.emit("flags:toggle", { id, flagId });
  const update = (flagId, fields) => socket.emit("flags:update", { id, flagId, ...fields });
  const del = (flagId) => socket.emit("flags:delete", { id, flagId });
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
          <h1 style={{ fontSize: 24 }}>Tableau introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le tableau a été créé sans base de données.</p>
          <a href="/flags" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🚩 {state.name || "Feature flags"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </header>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>Ajouter un flag</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="nom_du_flag" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, flex: "1 1 160px", fontFamily: "monospace" }} />
            <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
              style={{ ...inputStyle, flex: "0 1 110px" }}>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </select>
            <input placeholder="Propriétaire" value={form.owner}
              onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              style={{ ...inputStyle, flex: "1 1 120px" }} />
            <button onClick={add}
              style={{ padding: "10px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 14 }}>
              + Ajouter
            </button>
          </div>
        </div>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
          {state.flags.map(f => (
            <FlagRow key={f.id} flag={f} onToggle={toggle} onUpdate={update} onDelete={del} />
          ))}
          {state.flags.length === 0 && (
            <p style={{ color: "#555", fontSize: 13, padding: "20px 18px", margin: 0, textAlign: "center" }}>Aucun flag pour l'instant.</p>
          )}
        </div>

      </div>
    </div>
  );
}
