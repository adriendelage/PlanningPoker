import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#ff9f1c";

function progressColor(p) {
  if (p >= 70) return "#00f5d4";
  if (p >= 40) return ACCENT;
  return "#ff4444";
}

function KeyResult({ id, objectiveId, kr, onUpdate, onDelete }) {
  const bump = (delta) => onUpdate(objectiveId, kr.id, Math.max(0, Math.min(100, kr.progress + delta)));
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid #1a1a2e" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 14, color: "#ddd" }}>{kr.title}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: progressColor(kr.progress), minWidth: 36, textAlign: "right" }}>
          {kr.progress}%
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: "#1a1a2e", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${kr.progress}%`, height: "100%", background: progressColor(kr.progress), borderRadius: 999, transition: "width .2s ease" }} />
        </div>
        <button onClick={() => bump(-10)}
          style={{ width: 26, height: 26, background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#aaa", cursor: "pointer", fontSize: 14 }}>−</button>
        <button onClick={() => bump(10)}
          style={{ width: 26, height: 26, background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#aaa", cursor: "pointer", fontSize: 14 }}>+</button>
        <button onClick={() => onDelete(objectiveId, kr.id)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", marginLeft: 2 }}>✕</button>
      </div>
    </div>
  );
}

function ObjectiveCard({ obj, onAddKr, onUpdateKr, onDeleteKr, onDeleteObjective }) {
  const [draft, setDraft] = useState("");
  const avg = obj.keyResults.length
    ? Math.round(obj.keyResults.reduce((a, k) => a + k.progress, 0) / obj.keyResults.length)
    : 0;

  const add = () => {
    if (!draft.trim()) return;
    onAddKr(obj.id, draft);
    setDraft("");
  };

  return (
    <div style={{ background: "#111", border: "1px solid #222", borderTop: `3px solid ${ACCENT}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, flex: 1 }}>🎯 {obj.title}</h2>
        <span style={{ fontSize: 15, fontWeight: 800, color: progressColor(avg) }}>{avg}%</span>
        <button onClick={() => onDeleteObjective(obj.id)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ height: 5, background: "#1a1a2e", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ width: `${avg}%`, height: "100%", background: progressColor(avg), borderRadius: 999 }} />
      </div>

      {obj.keyResults.map(kr => (
        <KeyResult key={kr.id} objectiveId={obj.id} kr={kr} onUpdate={onUpdateKr} onDelete={onDeleteKr} />
      ))}
      {obj.keyResults.length === 0 && (
        <p style={{ color: "#444", fontSize: 13, margin: "8px 0" }}>Aucun résultat clé pour l'instant.</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input placeholder="+ Résultat clé (ex: Réduire le temps de build à 3 min)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          style={{ flex: 1, padding: "9px 12px", background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 13.5, outline: "none" }} />
        <button onClick={add}
          style={{ padding: "0 16px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: ACCENT, fontWeight: 700, cursor: "pointer", fontSize: 13.5 }}>
          Ajouter
        </button>
      </div>
    </div>
  );
}

export default function Okr() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newObjective, setNewObjective] = useState("");

  useEffect(() => {
    socket.emit("okr:open", { id });
    socket.on("okr:state", setState);
    socket.on("okr:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("okr:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("okr:state", setState);
      socket.off("okr:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "okr");
    addLocalSession({ id, tool: "okr", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const addObjective = () => {
    if (!newObjective.trim()) return;
    socket.emit("okr:objective:add", { id, title: newObjective });
    setNewObjective("");
  };
  const deleteObjective = (objectiveId) => socket.emit("okr:objective:delete", { id, objectiveId });
  const addKr = (objectiveId, title) => socket.emit("okr:kr:add", { id, objectiveId, title });
  const updateKr = (objectiveId, krId, progress) => socket.emit("okr:kr:update", { id, objectiveId, krId, progress });
  const deleteKr = (objectiveId, krId) => socket.emit("okr:kr:delete", { id, objectiveId, krId });

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
          <a href="/okr" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
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

  const globalAvg = state.objectives.length
    ? Math.round(state.objectives.reduce((sum, o) => {
        const a = o.keyResults.length ? o.keyResults.reduce((x, k) => x + k.progress, 0) / o.keyResults.length : 0;
        return sum + a;
      }, 0) / state.objectives.length)
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            🎯 {state.name || "OKR"}
          </h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le tableau"}
          </button>
        </header>

        {state.objectives.length > 0 && (
          <p style={{ margin: "0 0 22px", fontSize: 14, color: "#888" }}>
            Progression globale du cycle :{" "}
            <strong style={{ color: progressColor(globalAvg) }}>{globalAvg}%</strong>
          </p>
        )}

        {/* Ajout d'objectif */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input placeholder="Nouvel objectif (ex: Améliorer la fiabilité de la plateforme)"
            value={newObjective}
            onChange={e => setNewObjective(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addObjective()}
            style={{ flex: 1, padding: "12px 14px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 10, color: "#fff", fontSize: 15, outline: "none" }} />
          <button onClick={addObjective}
            style={{ padding: "0 20px", background: ACCENT, border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 15 }}>
            + Objectif
          </button>
        </div>

        {state.objectives.map(obj => (
          <ObjectiveCard key={obj.id} obj={obj}
            onAddKr={addKr} onUpdateKr={updateKr} onDeleteKr={deleteKr} onDeleteObjective={deleteObjective} />
        ))}

        {state.objectives.length === 0 && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "32px 16px", textAlign: "center", color: "#555" }}>
            Ajoute un premier objectif pour démarrer le cycle.
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 13, color: "#555" }}>
          Le tableau se synchronise en direct entre tous ceux qui ont le lien,
          et tout est sauvegardé automatiquement.
        </p>

      </div>
    </div>
  );
}
