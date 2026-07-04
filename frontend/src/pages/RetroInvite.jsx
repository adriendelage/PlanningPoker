import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import socket from "../socket";

export default function RetroInvite() {
  const { id } = useParams();
  const [name, setName] = useState("");
  const nav = useNavigate();

  const join = () => {
    if (!name.trim()) return alert("Veuillez saisir votre nom");
    socket.emit("retro:join", { id, name });
    nav("/retro/" + id);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400, color: "#fff", textAlign: "center" }}>

        <div style={{ fontSize: 52, marginBottom: 8 }}>🔄</div>
        <h1 style={{ margin: "0 0 6px", fontSize: 28, fontWeight: 700, color: "#f15bb5" }}>Rejoindre la rétro</h1>
        <p style={{ margin: "0 0 32px", color: "#555", fontSize: 15 }}>Saisis ton prénom pour participer</p>

        <div style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>
          <label style={{ display: "block", fontSize: 14, color: "#aaa", marginBottom: 8, textAlign: "left", fontWeight: 500 }}>
            Ton prénom
          </label>
          <input
            placeholder="Ex: Bob"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && join()}
            autoFocus
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#1a1a2e",
              border: "1px solid #444",
              borderRadius: 10,
              color: "#fff",
              fontSize: 16,
              outline: "none",
              marginBottom: 20
            }} />
          <button onClick={join}
            style={{ width: "100%", padding: "16px", background: "#f15bb5", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 17, color: "#0d0d1a" }}>
            Rejoindre →
          </button>
        </div>

      </div>
    </div>
  );
}
