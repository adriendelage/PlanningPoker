import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import { addLocalSession } from "../localHistory";

export default function PollHome() {
  const [hostName, setHostName] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const nav = useNavigate();

  const updateOption = (i, v) => setOptions(list => list.map((o, j) => j === i ? v : o));
  const addOption = () => options.length < 8 && setOptions(list => [...list, ""]);
  const removeOption = (i) => options.length > 2 && setOptions(list => list.filter((_, j) => j !== i));

  const create = () => {
    if (!hostName.trim()) return alert("Veuillez saisir votre nom");
    if (!question.trim()) return alert("Pose ta question");
    const cleaned = options.map(o => o.trim()).filter(Boolean);
    if (cleaned.length < 2) return alert("Il faut au moins 2 options");
    socket.emit("poll:create", { hostName, question, options: cleaned }, (id) => {
      if (!id) return alert("Erreur à la création du sondage");
      addLocalSession({ id, tool: "poll", name: question, role: "host" });
      nav("/poll/" + id + "?host=true");
    });
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", marginBottom: 16,
    background: "#1a1a2e", border: "1px solid #444", borderRadius: 10,
    color: "#fff", fontSize: 16, outline: "none",
  };
  const labelStyle = { display: "block", fontSize: 14, color: "#aaa", marginBottom: 6, fontWeight: 500 };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 540, color: "#fff" }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 16 }}>
          ← Retour aux outils
        </a>

        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🗳️</div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: "#118ab2" }}>Sondage rapide</h1>
          <p style={{ margin: "8px 0 0", color: "#555", fontSize: 15 }}>
            Une décision d'équipe, en direct, sans détour
          </p>
        </div>

        <div style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>

          <label style={labelStyle}>Ton nom</label>
          <input placeholder="Ex: Alice" value={hostName}
            onChange={e => setHostName(e.target.value)} style={inputStyle} autoFocus />

          <label style={labelStyle}>Question</label>
          <input placeholder="Ex: On part sur quelle stack ?" value={question}
            onChange={e => setQuestion(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Options</label>
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input placeholder={`Option ${i + 1}`} value={o}
                onChange={e => updateOption(i, e.target.value)}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)}
                  style={{ background: "none", border: "1px solid #333", borderRadius: 10, color: "#666", cursor: "pointer", padding: "0 14px" }}>✕</button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button onClick={addOption}
              style={{ background: "none", border: "1px dashed #444", borderRadius: 10, color: "#666", cursor: "pointer", padding: "10px 16px", fontSize: 14, width: "100%", marginTop: 8, marginBottom: 20 }}>
              + Ajouter une option
            </button>
          )}

          <button onClick={create}
            style={{ width: "100%", padding: 16, background: "#118ab2", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 17, color: "#fff" }}>
            Lancer le sondage →
          </button>
        </div>

      </div>
    </div>
  );
}
