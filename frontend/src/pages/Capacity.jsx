import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#06d6a0";

function avgAvailability(members) {
  if (members.length === 0) return 0;
  return Math.round(members.reduce((s, m) => s + m.availability, 0) / members.length);
}

export default function Capacity() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [sprintName, setSprintName] = useState("");
  const [refVelocity, setRefVelocity] = useState("");
  const [members, setMembers] = useState([{ name: "", availability: 100 }]);

  useEffect(() => {
    socket.emit("capacity:open", { id });
    socket.on("capacity:state", setState);
    socket.on("capacity:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("capacity:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("capacity:state", setState);
      socket.off("capacity:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "capacity");
    addLocalSession({ id, tool: "capacity", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const validMembers = useMemo(
    () => members.filter(m => m.name.trim()),
    [members]
  );
  const livePreview = useMemo(() => {
    const ref = parseInt(refVelocity) || 0;
    if (validMembers.length === 0) return 0;
    return Math.round(ref * (avgAvailability(validMembers) / 100));
  }, [refVelocity, validMembers]);

  const updateMember = (i, field, value) => {
    setMembers(list => list.map((m, j) => j === i ? { ...m, [field]: value } : m));
  };
  const addMemberRow = () => setMembers(list => [...list, { name: "", availability: 100 }]);
  const removeMemberRow = (i) => setMembers(list => list.filter((_, j) => j !== i));

  const submit = () => {
    if (!sprintName.trim()) return alert("Donne un nom au sprint");
    if (validMembers.length === 0) return alert("Ajoute au moins un membre d'équipe");
    socket.emit("capacity:entry:add", {
      id,
      sprintName,
      refVelocity,
      members: validMembers,
    });
    setSprintName("");
    setMembers([{ name: "", availability: 100 }]);
  };

  const del = (entryId) => socket.emit("capacity:entry:delete", { id, entryId });

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
          <a href="/capacity" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            🧮 {state.name || "Capacité"}
          </h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le tableau"}
          </button>
        </header>

        {/* Formulaire de planification */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, color: "#aaa" }}>Planifier un sprint</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#666" }}>
            La vélocité de référence vient de ton tableau de{" "}
            <a href="/velocity" style={{ color: "#00bbf9" }}>Suivi de vélocité</a>{" "}
            si tu en as un (moyenne des derniers sprints à effectif complet).
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <input placeholder="Nom du sprint (ex: Sprint 13)" value={sprintName}
              onChange={e => setSprintName(e.target.value)}
              style={{ ...inputStyle, flex: "2 1 180px" }} />
            <input placeholder="Vélocité de référence (pts)" type="number" min="0" value={refVelocity}
              onChange={e => setRefVelocity(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 180px" }} />
          </div>

          <div style={{ fontSize: 12.5, color: "#666", marginBottom: 8 }}>Équipe et disponibilité pour ce sprint :</div>
          {members.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input placeholder="Nom" value={m.name}
                onChange={e => updateMember(i, "name", e.target.value)}
                style={{ ...inputStyle, flex: "1 1 140px" }} />
              <input type="range" min="0" max="100" step="5" value={m.availability}
                onChange={e => updateMember(i, "availability", parseInt(e.target.value))}
                style={{ flex: "2 1 140px", accentColor: ACCENT }} />
              <span style={{ fontSize: 13, color: ACCENT, fontWeight: 700, width: 42, textAlign: "right" }}>
                {m.availability}%
              </span>
              {members.length > 1 && (
                <button onClick={() => removeMemberRow(i)}
                  style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", cursor: "pointer", padding: "4px 10px" }}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button onClick={addMemberRow}
            style={{ background: "none", border: "1px dashed #444", borderRadius: 8, color: "#666", cursor: "pointer", padding: "8px 14px", fontSize: 13, marginBottom: 16 }}>
            + Ajouter un membre
          </button>

          {validMembers.length > 0 && (
            <div style={{ background: "#0d0d1a", border: `1px solid ${ACCENT}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#999" }}>
                Disponibilité moyenne <strong style={{ color: "#fff" }}>{avgAvailability(validMembers)}%</strong> →
              </span>
              <span style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>
                {livePreview} pts suggérés
              </span>
            </div>
          )}

          <button onClick={submit}
            style={{ width: "100%", padding: "12px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 15 }}>
            Enregistrer ce sprint
          </button>
        </div>

        {/* Historique */}
        {state.entries.length > 0 && (
          <div>
            <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Historique</h2>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
              {[...state.entries].reverse().map((e, i) => (
                <div key={e.id}>
                  <div
                    onClick={() => setExpanded(x => x === e.id ? null : e.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "12px 18px",
                      borderTop: i > 0 ? "1px solid #1c1c30" : "none", cursor: "pointer",
                    }}>
                    <span style={{ flex: 1, fontSize: 14.5, color: "#ddd" }}>{e.sprintName}</span>
                    <span style={{ fontSize: 12.5, color: "#666" }}>
                      réf. {e.refVelocity} pts · dispo {avgAvailability(e.members)}%
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>{e.suggested} pts</span>
                    <button onClick={ev => { ev.stopPropagation(); del(e.id); }}
                      style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
                  </div>
                  {expanded === e.id && (
                    <div style={{ padding: "4px 18px 14px 18px", borderTop: "1px dashed #1c1c30" }}>
                      {e.members.map((m, j) => (
                        <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#999" }}>
                          <span>{m.name}</span>
                          <span>{m.availability}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {state.entries.length === 0 && (
          <p style={{ fontSize: 13, color: "#555", textAlign: "center" }}>
            Aucun sprint planifié pour l'instant.
          </p>
        )}

      </div>
    </div>
  );
}
