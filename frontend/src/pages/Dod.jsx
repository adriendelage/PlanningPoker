import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#8ac926";

export default function Dod() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    socket.emit("dod:open", { id });
    socket.on("dod:state", setState);
    socket.on("dod:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("dod:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("dod:state", setState);
      socket.off("dod:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "dod");
    addLocalSession({ id, tool: "dod", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const add = () => {
    if (!draft.trim()) return;
    socket.emit("dod:item:add", { id, text: draft });
    setDraft("");
  };
  const toggle = (itemId) => socket.emit("dod:item:toggle", { id, itemId });
  const del = (itemId) => socket.emit("dod:item:delete", { id, itemId });
  const reset = () => socket.emit("dod:reset", { id });
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
          <h1 style={{ fontSize: 24 }}>Checklist introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou la checklist a été créée sans base de données.</p>
          <a href="/dod" style={{ color: ACCENT }}>Créer une nouvelle checklist</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture de la checklist…
      </div>
    );
  }

  const doneCount = state.items.filter(i => i.checked).length;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>✅ {state.name || "Definition of Done"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </header>

        {state.items.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 8, background: "#1a1a2e", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(doneCount / state.items.length) * 100}%`, height: "100%", background: ACCENT, borderRadius: 999, transition: "width .2s ease" }} />
            </div>
            <span style={{ fontSize: 13, color: "#999", whiteSpace: "nowrap" }}>{doneCount}/{state.items.length}</span>
            <button onClick={reset}
              style={{ background: "none", border: "1px solid #333", borderRadius: 8, color: "#666", cursor: "pointer", padding: "6px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>
              ↺ Réinitialiser
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          <input placeholder="Nouveau critère (ex: Tests unitaires passés)" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            style={{ flex: 1, padding: "12px 14px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 10, color: "#fff", fontSize: 15, outline: "none" }} />
          <button onClick={add}
            style={{ padding: "0 20px", background: ACCENT, border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 15 }}>
            + Ajouter
          </button>
        </div>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
          {state.items.map((item, i) => (
            <div key={item.id}
              onClick={() => toggle(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", cursor: "pointer",
                borderTop: i > 0 ? "1px solid #1c1c30" : "none",
              }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${item.checked ? ACCENT : "#444"}`,
                background: item.checked ? ACCENT : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#0d0d1a", fontSize: 14, fontWeight: 900,
              }}>
                {item.checked && "✓"}
              </span>
              <span style={{ flex: 1, fontSize: 15, color: item.checked ? "#666" : "#ddd", textDecoration: item.checked ? "line-through" : "none" }}>
                {item.text}
              </span>
              <button onClick={e => { e.stopPropagation(); del(item.id); }}
                style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          {state.items.length === 0 && (
            <p style={{ color: "#555", fontSize: 13, padding: "20px 18px", margin: 0, textAlign: "center" }}>
              Aucun critère pour l'instant.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
