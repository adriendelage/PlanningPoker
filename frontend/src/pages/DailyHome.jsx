import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";

const DURATIONS = [60, 90, 120, 180, 300];

export default function DailyHome() {
  const [sessionName, setSessionName] = useState("");
  const [hostName, setHostName] = useState("");
  const [seconds, setSeconds] = useState(120);
  const nav = useNavigate();

  const create = () => {
    if (!hostName.trim()) return alert("Veuillez saisir votre nom");
    socket.emit("daily:create", { sessionName, hostName, secondsPerPerson: seconds }, (id) => {
      nav("/daily/" + id + "?host=true");
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
          <div style={{ fontSize: 52, marginBottom: 8 }}>⏱️</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: "#fee440" }}>Daily Timer</h1>
          <p style={{ margin: "8px 0 0", color: "#555", fontSize: 15 }}>Un temps de parole équitable pour le stand-up</p>
        </div>

        <div style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>

          <label style={labelStyle}>Ton nom (animateur)</label>
          <input placeholder="Ex: Alice" value={hostName}
            onChange={e => setHostName(e.target.value)}
            style={inputStyle} autoFocus />

          <label style={labelStyle}>Nom du daily</label>
          <input placeholder="Ex: Daily équipe Front" value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            style={inputStyle} />

          <label style={labelStyle}>Temps de parole par personne</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
            {DURATIONS.map(s => (
              <button key={s} onClick={() => setSeconds(s)}
                style={{
                  padding: "9px 16px",
                  background: seconds === s ? "#fee44022" : "#1a1a2e",
                  border: `1px solid ${seconds === s ? "#fee440" : "#444"}`,
                  borderRadius: 999,
                  color: seconds === s ? "#fee440" : "#aaa",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>
                {s < 60 ? `${s}s` : `${s / 60} min`}
              </button>
            ))}
          </div>

          <button onClick={create}
            style={{ width: "100%", padding: 16, background: "#fee440", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 17, color: "#0d0d1a" }}>
            Ouvrir le lobby →
          </button>
        </div>

      </div>
    </div>
  );
}
