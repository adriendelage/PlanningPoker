import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#ef476f";

function avgConfidence(votes) {
  if (votes.length === 0) return 0;
  return (votes.reduce((s, v) => s + v.confidence, 0) / votes.length).toFixed(1);
}

export default function Goal() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const [sprintName, setSprintName] = useState("");
  const [goalText, setGoalText] = useState("");
  const [votes, setVotes] = useState([{ name: "", confidence: 3 }]);

  useEffect(() => {
    socket.emit("goal:open", { id });
    socket.on("goal:state", setState);
    socket.on("goal:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("goal:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("goal:state", setState);
      socket.off("goal:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "goal");
    addLocalSession({ id, tool: "goal", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const updateVote = (i, field, value) => setVotes(list => list.map((v, j) => j === i ? { ...v, [field]: value } : v));
  const addVoteRow = () => setVotes(list => [...list, { name: "", confidence: 3 }]);
  const removeVoteRow = (i) => setVotes(list => list.filter((_, j) => j !== i));

  const submit = () => {
    if (!sprintName.trim()) return alert("Donne un nom au sprint");
    if (!goalText.trim()) return alert("Formule l'objectif du sprint");
    const validVotes = votes.filter(v => v.name.trim());
    socket.emit("goal:entry:add", { id, sprintName, goalText, votes: validVotes });
    setSprintName(""); setGoalText(""); setVotes([{ name: "", confidence: 3 }]);
  };

  const setAchieved = (entryId, achieved) => socket.emit("goal:entry:achieved", { id, entryId, achieved });
  const del = (entryId) => socket.emit("goal:entry:delete", { id, entryId });
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
          <a href="/goal" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>🚀 {state.name || "Objectif de sprint"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le tableau"}
          </button>
        </header>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#aaa" }}>Nouveau sprint</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input placeholder="Nom du sprint (ex: Sprint 14)" value={sprintName}
              onChange={e => setSprintName(e.target.value)} style={{ ...inputStyle, flex: "1 1 200px" }} />
          </div>
          <textarea placeholder="Objectif du sprint, en une phrase…" value={goalText} rows={2}
            onChange={e => setGoalText(e.target.value)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "none", marginBottom: 14, fontFamily: "inherit" }} />

          <div style={{ fontSize: 12.5, color: "#666", marginBottom: 8 }}>Confiance de chacun (1 = pas confiant, 5 = très confiant) :</div>
          {votes.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input placeholder="Nom" value={v.name}
                onChange={e => updateVote(i, "name", e.target.value)}
                style={{ ...inputStyle, flex: "1 1 140px" }} />
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => updateVote(i, "confidence", n)}
                    style={{
                      width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                      background: v.confidence === n ? ACCENT : "#1a1a2e",
                      border: `1px solid ${v.confidence === n ? ACCENT : "#333"}`,
                      color: v.confidence === n ? "#fff" : "#999", fontSize: 13, fontWeight: 700,
                    }}>{n}</button>
                ))}
              </div>
              {votes.length > 1 && (
                <button onClick={() => removeVoteRow(i)}
                  style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", cursor: "pointer", padding: "4px 10px" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={addVoteRow}
            style={{ background: "none", border: "1px dashed #444", borderRadius: 8, color: "#666", cursor: "pointer", padding: "8px 14px", fontSize: 13, marginBottom: 16 }}>
            + Ajouter une personne
          </button>

          <button onClick={submit}
            style={{ width: "100%", padding: "12px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 15 }}>
            Archiver ce sprint
          </button>
        </div>

        {state.entries.length > 0 && (
          <div>
            <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Historique</h2>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
              {[...state.entries].reverse().map((e, i) => (
                <div key={e.id} style={{ padding: "14px 18px", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>{e.sprintName}</span>
                    <span style={{ fontSize: 12.5, color: ACCENT }}>confiance moy. {avgConfidence(e.votes)}/5</span>
                    <button onClick={() => del(e.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
                  </div>
                  <p style={{ margin: "4px 0 10px", fontSize: 15, color: "#ddd" }}>{e.goalText}</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => setAchieved(e.id, true)}
                      style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, cursor: "pointer", background: e.achieved === true ? "#00f5d4" : "#1a1a2e", border: `1px solid ${e.achieved === true ? "#00f5d4" : "#333"}`, color: e.achieved === true ? "#0d0d1a" : "#999", fontWeight: 600 }}>
                      ✓ Atteint
                    </button>
                    <button onClick={() => setAchieved(e.id, false)}
                      style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, cursor: "pointer", background: e.achieved === false ? "#ff4444" : "#1a1a2e", border: `1px solid ${e.achieved === false ? "#ff4444" : "#333"}`, color: e.achieved === false ? "#fff" : "#999", fontWeight: 600 }}>
                      ✗ Manqué
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
