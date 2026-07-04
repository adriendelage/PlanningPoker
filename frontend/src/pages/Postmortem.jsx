import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#c1121f";

export default function Postmortem() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const [eventTime, setEventTime] = useState("");
  const [eventText, setEventText] = useState("");
  const [rootCauseDraft, setRootCauseDraft] = useState("");
  const [actionDraft, setActionDraft] = useState("");

  useEffect(() => {
    socket.emit("postmortem:open", { id });
    socket.on("postmortem:state", s => { setState(s); setRootCauseDraft(s.rootCause); });
    socket.on("postmortem:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("postmortem:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("postmortem:state");
      socket.off("postmortem:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "postmortem");
    addLocalSession({ id, tool: "postmortem", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const addEvent = () => {
    if (!eventText.trim()) return;
    socket.emit("postmortem:timeline:add", { id, time: eventTime, text: eventText });
    setEventTime(""); setEventText("");
  };
  const delEvent = (i) => socket.emit("postmortem:timeline:delete", { id, index: i });
  const saveRootCause = () => socket.emit("postmortem:rootcause:update", { id, text: rootCauseDraft });
  const addAction = () => {
    if (!actionDraft.trim()) return;
    socket.emit("postmortem:action:add", { id, text: actionDraft });
    setActionDraft("");
  };
  const toggleAction = (i) => socket.emit("postmortem:action:toggle", { id, index: i });
  const delAction = (i) => socket.emit("postmortem:action:delete", { id, index: i });
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
          <h1 style={{ fontSize: 24 }}>Post-mortem introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le tableau a été créé sans base de données.</p>
          <a href="/postmortem" style={{ color: ACCENT }}>Créer un nouveau post-mortem</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture du post-mortem…
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

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🩹 {state.name || "Post-mortem"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </header>

        {/* Chronologie */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: "#aaa", marginBottom: 12 }}>🕐 Chronologie</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input placeholder="Heure (ex: 14:32)" value={eventTime}
              onChange={e => setEventTime(e.target.value)} style={{ ...inputStyle, width: 120 }} />
            <input placeholder="Ce qui s'est passé…" value={eventText}
              onChange={e => setEventText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEvent()}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addEvent}
              style={{ padding: "0 16px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 14 }}>+</button>
          </div>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
            {state.timeline.map((ev, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 16px", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
                <span style={{ fontSize: 12.5, color: ACCENT, fontWeight: 700, minWidth: 50 }}>{ev.time || "—"}</span>
                <span style={{ flex: 1, fontSize: 14, color: "#ddd" }}>{ev.text}</span>
                <button onClick={() => delEvent(i)} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {state.timeline.length === 0 && <p style={{ color: "#555", fontSize: 13, padding: "16px", margin: 0, textAlign: "center" }}>Aucun événement pour l'instant.</p>}
          </div>
        </section>

        {/* Cause racine */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: "#aaa", marginBottom: 12 }}>🔍 Cause racine</h2>
          <textarea value={rootCauseDraft} rows={4} placeholder="Qu'est-ce qui a vraiment causé l'incident (pas seulement le symptôme) ?"
            onChange={e => setRootCauseDraft(e.target.value)}
            onBlur={saveRootCause}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555" }}>Enregistré automatiquement en cliquant en dehors du champ.</p>
        </section>

        {/* Actions correctives */}
        <section>
          <h2 style={{ fontSize: 16, color: "#aaa", marginBottom: 12 }}>✔️ Actions correctives</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input placeholder="Ex: Ajouter une alerte sur la latence DB" value={actionDraft}
              onChange={e => setActionDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addAction()}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addAction}
              style={{ padding: "0 16px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 14 }}>+</button>
          </div>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
            {state.actions.map((a, i) => (
              <div key={i} onClick={() => toggleAction(i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${a.done ? ACCENT : "#444"}`, background: a.done ? ACCENT : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff",
                }}>{a.done && "✓"}</span>
                <span style={{ flex: 1, fontSize: 14, color: a.done ? "#666" : "#ddd", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</span>
                <button onClick={e => { e.stopPropagation(); delAction(i); }} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            {state.actions.length === 0 && <p style={{ color: "#555", fontSize: 13, padding: "16px", margin: 0, textAlign: "center" }}>Aucune action pour l'instant.</p>}
          </div>
        </section>

      </div>
    </div>
  );
}
