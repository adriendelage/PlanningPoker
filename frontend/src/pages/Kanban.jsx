import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";

const COLUMNS = [
  { name: "À faire",  accent: "#9b5de5", icon: "📥" },
  { name: "En cours", accent: "#fee440", icon: "🔧" },
  { name: "Terminé",  accent: "#00f5d4", icon: "✅" },
];

function Card({ card, colIndex, onMove, onDelete }) {
  return (
    <div style={{
      background: "#1a1a2e", border: "1px solid #2a2a44", borderRadius: 10,
      padding: "11px 12px", fontSize: 14.5, lineHeight: 1.4, color: "#ddd",
    }}>
      {card.title}
      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button
          onClick={() => onMove(card.id, COLUMNS[colIndex - 1].name)}
          disabled={colIndex === 0}
          title={colIndex > 0 ? `Vers « ${COLUMNS[colIndex - 1].name} »` : ""}
          style={{
            background: "none", border: "1px solid #333", borderRadius: 6,
            color: colIndex === 0 ? "#333" : "#aaa", fontSize: 13, padding: "3px 12px",
            cursor: colIndex === 0 ? "default" : "pointer",
          }}>←</button>
        <button
          onClick={() => onMove(card.id, COLUMNS[colIndex + 1].name)}
          disabled={colIndex === COLUMNS.length - 1}
          title={colIndex < COLUMNS.length - 1 ? `Vers « ${COLUMNS[colIndex + 1].name} »` : ""}
          style={{
            background: "none", border: "1px solid #333", borderRadius: 6,
            color: colIndex === COLUMNS.length - 1 ? "#333" : "#aaa", fontSize: 13, padding: "3px 12px",
            cursor: colIndex === COLUMNS.length - 1 ? "default" : "pointer",
          }}>→</button>
        <button onClick={() => onDelete(card.id)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

export default function Kanban() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.emit("kanban:open", { id });
    socket.on("kanban:state", setState);
    socket.on("kanban:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("kanban:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("kanban:state", setState);
      socket.off("kanban:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  const add = () => {
    if (!draft.trim()) return;
    socket.emit("kanban:card:add", { id, column: "À faire", title: draft });
    setDraft("");
  };
  const move = (cardId, toColumn) => socket.emit("kanban:card:move", { id, cardId, toColumn });
  const del = (cardId) => socket.emit("kanban:card:delete", { id, cardId });

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
          <a href="/kanban" style={{ color: "#9b5de5" }}>Créer un nouveau tableau</a>
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

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            📋 {state.name || "Kanban"}
          </h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le tableau"}
          </button>
        </header>

        {/* Ajout rapide */}
        <div style={{ display: "flex", gap: 8, marginBottom: 22, maxWidth: 560 }}>
          <input
            placeholder="Nouvelle carte… (Entrée pour ajouter dans « À faire »)"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            style={{
              flex: 1, padding: "12px 14px", background: "#1a1a2e",
              border: "1px solid #444", borderRadius: 10,
              color: "#fff", fontSize: 15, outline: "none",
            }} />
          <button onClick={add}
            style={{ padding: "0 20px", background: "#9b5de5", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 15 }}>
            + Ajouter
          </button>
        </div>

        {/* Colonnes */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16, alignItems: "start",
        }}>
          {COLUMNS.map((col, i) => {
            const cards = state.cards.filter(c => c.column === col.name);
            return (
              <div key={col.name} style={{
                background: "#111", border: "1px solid #222",
                borderTop: `3px solid ${col.accent}`,
                borderRadius: 14, padding: 16,
                display: "flex", flexDirection: "column", gap: 10, minHeight: 160,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: col.accent }}>
                    {col.icon} {col.name}
                  </h2>
                  <span style={{ fontSize: 12.5, color: "#555" }}>{cards.length}</span>
                </div>
                {cards.map(c => (
                  <Card key={c.id} card={c} colIndex={i} onMove={move} onDelete={del} />
                ))}
                {cards.length === 0 && (
                  <p style={{ color: "#444", fontSize: 13, margin: "4px 0" }}>Aucune carte.</p>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: 22, fontSize: 13, color: "#555" }}>
          Le tableau se synchronise en direct entre tous ceux qui ont le lien,
          et tout est sauvegardé automatiquement.
        </p>

      </div>
    </div>
  );
}
