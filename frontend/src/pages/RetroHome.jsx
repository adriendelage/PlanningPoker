import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";

const TEMPLATES = [
  { id: "ssc",  name: "Start · Stop · Continue", columns: ["Start", "Stop", "Continue"] },
  { id: "gsm",  name: "Glad · Sad · Mad",        columns: ["😊 Glad", "😢 Sad", "😡 Mad"] },
  { id: "4l",   name: "4L",                      columns: ["Liked", "Learned", "Lacked", "Longed for"] },
  { id: "custom", name: "Personnalisé",          columns: ["", "", ""] },
];

export default function RetroHome() {
  const [sessionName, setSessionName] = useState("");
  const [hostName, setHostName] = useState("");
  const [template, setTemplate] = useState("ssc");
  const [customCols, setCustomCols] = useState(["", "", ""]);
  const [maxVotes, setMaxVotes] = useState(3);
  const nav = useNavigate();

  const columns = template === "custom"
    ? customCols
    : TEMPLATES.find(t => t.id === template).columns;

  const create = () => {
    if (!hostName.trim()) return alert("Veuillez saisir votre nom");
    const cols = columns.map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) return alert("Il faut au moins 2 colonnes");
    socket.emit("retro:create", { sessionName, hostName, columns: cols, maxVotes }, (id) => {
      nav("/retro/" + id + "?host=true");
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    marginBottom: 20,
    background: "#1a1a2e",
    border: "1px solid #444",
    borderRadius: 10,
    color: "#fff",
    fontSize: 16,
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    color: "#aaa",
    marginBottom: 6,
    fontWeight: 500,
    letterSpacing: "0.3px"
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 540, color: "#fff" }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 16 }}>
          ← Retour aux outils
        </a>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🔄</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: "#f15bb5" }}>Rétrospective</h1>
          <p style={{ margin: "8px 0 0", color: "#555", fontSize: 15 }}>Créer une nouvelle rétro</p>
        </div>

        <div style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>

          <label style={labelStyle}>Ton nom (facilitateur)</label>
          <input placeholder="Ex: Alice" value={hostName}
            onChange={e => setHostName(e.target.value)}
            style={inputStyle} autoFocus />

          <label style={labelStyle}>Nom de la rétro</label>
          <input placeholder="Ex: Rétro Sprint 42" value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            style={inputStyle} />

          <label style={labelStyle}>Modèle de colonnes</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setTemplate(t.id)}
                style={{
                  padding: "9px 14px",
                  background: template === t.id ? "#f15bb522" : "#1a1a2e",
                  border: `1px solid ${template === t.id ? "#f15bb5" : "#444"}`,
                  borderRadius: 999,
                  color: template === t.id ? "#f15bb5" : "#aaa",
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}>
                {t.name}
              </button>
            ))}
          </div>

          {template === "custom" && (
            <div style={{ marginBottom: 20 }}>
              {customCols.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input placeholder={`Colonne ${i + 1}`} value={c}
                    onChange={e => setCustomCols(cols => cols.map((x, j) => j === i ? e.target.value : x))}
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                  {customCols.length > 2 && (
                    <button onClick={() => setCustomCols(cols => cols.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "1px solid #333", borderRadius: 10, color: "#666", cursor: "pointer", padding: "0 14px" }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {customCols.length < 5 && (
                <button onClick={() => setCustomCols(cols => [...cols, ""])}
                  style={{ background: "none", border: "1px dashed #444", borderRadius: 10, color: "#666", cursor: "pointer", padding: "10px 16px", fontSize: 14, width: "100%" }}>
                  + Ajouter une colonne
                </button>
              )}
            </div>
          )}

          <label style={labelStyle}>Votes par participant : <span style={{ color: "#f15bb5", fontWeight: 700 }}>{maxVotes}</span></label>
          <input type="range" min={1} max={10} value={maxVotes}
            onChange={e => setMaxVotes(Number(e.target.value))}
            style={{ width: "100%", marginBottom: 24, accentColor: "#f15bb5" }} />

          <button onClick={create}
            style={{ width: "100%", padding: 16, background: "#f15bb5", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 17, color: "#0d0d1a" }}>
            Lancer la rétro →
          </button>
        </div>

      </div>
    </div>
  );
}
