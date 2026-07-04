import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import { addLocalSession } from "../localHistory";

export default function OkrHome() {
  const [name, setName] = useState("");
  const [hostName, setHostName] = useState("");
  const nav = useNavigate();

  const create = () => {
    if (!hostName.trim()) return alert("Veuillez saisir votre nom");
    if (!name.trim()) return alert("Donne un nom au cycle (ex: Q3 2026)");
    socket.emit("okr:create", { name, hostName }, (id) => {
      addLocalSession({ id, tool: "okr", name, role: "host" });
      nav("/okr/" + id);
    });
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", marginBottom: 20,
    background: "#1a1a2e", border: "1px solid #444", borderRadius: 10,
    color: "#fff", fontSize: 16, outline: "none",
  };
  const labelStyle = {
    display: "block", fontSize: 14, color: "#aaa",
    marginBottom: 6, fontWeight: 500, letterSpacing: "0.3px"
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 540, color: "#fff" }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 16 }}>
          ← Retour aux outils
        </a>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🎯</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: "#ff9f1c" }}>OKR léger</h1>
          <p style={{ margin: "8px 0 0", color: "#555", fontSize: 15 }}>
            Objectifs et résultats clés, mis à jour en équipe au fil du cycle
          </p>
        </div>

        <div style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>

          <label style={labelStyle}>Ton nom</label>
          <input placeholder="Ex: Alice" value={hostName}
            onChange={e => setHostName(e.target.value)}
            style={inputStyle} autoFocus />

          <label style={labelStyle}>Nom du cycle</label>
          <input placeholder="Ex: Q3 2026 — Équipe Backend" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && create()}
            style={inputStyle} />

          <button onClick={create}
            style={{ width: "100%", padding: 16, background: "#ff9f1c", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 17, color: "#0d0d1a" }}>
            Créer le tableau →
          </button>

          <p style={{ margin: "16px 0 0", fontSize: 13, color: "#555", textAlign: "center" }}>
            Comme le Kanban, ce tableau est permanent : garde le lien et
            mets à jour la progression tout au long du cycle.
          </p>
        </div>

      </div>
    </div>
  );
}
