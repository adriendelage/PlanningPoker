import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";
import { computeCPM } from "../cpm";

const ACCENT = "#e63946";       // chemin critique
const NEUTRAL_BAR = "#2f4a5c";  // tâches non critiques

// ─── Graphique de Gantt (SVG fait main) ──────────────────────────────────────
function GanttChart({ tasks, projectDuration }) {
  const rowH = 34;
  const padL = 160, padR = 24, padT = 30, padB = 10;
  const dayW = Math.max(18, Math.min(48, 560 / Math.max(projectDuration, 1)));
  const chartW = padL + projectDuration * dayW + padR;
  const chartH = padT + tasks.length * rowH + padB;

  const rowY = new Map(tasks.map((t, i) => [t.id, padT + i * rowH + rowH / 2]));
  const xOf = day => padL + day * dayW;

  // Graduations de l'axe des jours (espacées pour rester lisibles)
  const tickEvery = Math.max(1, Math.ceil(projectDuration / 12));
  const ticks = [];
  for (let d = 0; d <= projectDuration; d += tickEvery) ticks.push(d);

  return (
    <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#555" />
        </marker>
      </defs>

      {/* Grille verticale + labels de jours */}
      {ticks.map(d => (
        <g key={d}>
          <line x1={xOf(d)} x2={xOf(d)} y1={padT - 8} y2={chartH - padB} stroke="#1c1c30" strokeWidth="1" />
          <text x={xOf(d)} y={padT - 14} textAnchor="middle" fontSize="10.5" fill="#666">J{d}</text>
        </g>
      ))}

      {/* Flèches de dépendance : fin du prédécesseur → début de la tâche */}
      {tasks.map(t => t.dependsOn.map(depId => {
        const pred = tasks.find(p => p.id === depId);
        if (!pred) return null;
        const x1 = xOf(pred.ef), y1 = rowY.get(pred.id);
        const x2 = xOf(t.es), y2 = rowY.get(t.id);
        const midX = x1 + Math.max(8, (x2 - x1) / 2);
        return (
          <path key={`${depId}-${t.id}`}
            d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - 6} ${y2}`}
            fill="none" stroke="#555" strokeWidth="1.3" markerEnd="url(#arrow)" opacity="0.7" />
        );
      }))}

      {/* Barres de tâches + noms + marge résiduelle en pointillés */}
      {tasks.map((t, i) => {
        const y = padT + i * rowH + rowH / 2;
        const barH = 16;
        const color = t.critical ? ACCENT : NEUTRAL_BAR;
        return (
          <g key={t.id}>
            <text x={padL - 10} y={y + 4} textAnchor="end" fontSize="12.5" fill="#ccc">
              {t.name.length > 22 ? t.name.slice(0, 21) + "…" : t.name}
            </text>
            {/* Marge (ES→EF jusqu'à LF) affichée en pointillé pour les tâches non critiques */}
            {!t.critical && t.lf > t.ef && (
              <rect x={xOf(t.ef)} y={y - barH / 2} width={xOf(t.lf) - xOf(t.ef)} height={barH}
                fill="none" stroke="#444" strokeWidth="1" strokeDasharray="3 3" rx="3" />
            )}
            <rect x={xOf(t.es)} y={y - barH / 2} width={Math.max(2, xOf(t.ef) - xOf(t.es))} height={barH}
              fill={color} rx="4" />
            <text x={xOf(t.es) + 6} y={y + 4} fontSize="10.5" fill="#0d0d1a" fontWeight="700"
              style={{ pointerEvents: "none" }}>
              {xOf(t.ef) - xOf(t.es) > 24 ? `${t.duration}j` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Éditeur de dépendances (repliable) ──────────────────────────────────────
function DependencyEditor({ task, allTasks, onChange }) {
  const [open, setOpen] = useState(false);
  const candidates = allTasks.filter(t => t.id !== task.id);

  const toggle = (depId) => {
    const next = task.dependsOn.includes(depId)
      ? task.dependsOn.filter(d => d !== depId)
      : [...task.dependsOn, depId];
    onChange(task.id, next);
  };

  if (candidates.length === 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", color: "#666", fontSize: 12, cursor: "pointer", padding: 0 }}>
        {open ? "▲" : "▼"} dépendances ({task.dependsOn.length})
      </button>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {candidates.map(c => (
            <label key={c.id} style={{
              display: "flex", alignItems: "center", gap: 5,
              background: task.dependsOn.includes(c.id) ? "#e6394622" : "#1a1a2e",
              border: `1px solid ${task.dependsOn.includes(c.id) ? ACCENT : "#333"}`,
              borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer",
              color: task.dependsOn.includes(c.id) ? ACCENT : "#999",
            }}>
              <input type="checkbox" checked={task.dependsOn.includes(c.id)}
                onChange={() => toggle(c.id)} style={{ display: "none" }} />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Gantt() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", duration: "1", deps: [] });

  useEffect(() => {
    socket.emit("gantt:open", { id });
    socket.on("gantt:state", setState);
    socket.on("gantt:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("gantt:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("gantt:state", setState);
      socket.off("gantt:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "gantt");
    addLocalSession({ id, tool: "gantt", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const cpm = useMemo(() => {
    if (!state) return null;
    return computeCPM(state.tasks);
  }, [state]);

  const addTask = () => {
    if (!form.name.trim()) return;
    socket.emit("gantt:task:add", { id, name: form.name, duration: form.duration, dependsOn: form.deps });
    setForm({ name: "", duration: "1", deps: [] });
  };
  const updateDeps = (taskId, dependsOn) => socket.emit("gantt:task:deps:update", { id, taskId, dependsOn });
  const updateDuration = (taskId, duration) => socket.emit("gantt:task:update", { id, taskId, duration });
  const deleteTask = (taskId) => socket.emit("gantt:task:delete", { id, taskId });

  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleFormDep = (taskId) => {
    setForm(f => ({
      ...f,
      deps: f.deps.includes(taskId) ? f.deps.filter(d => d !== taskId) : [...f.deps, taskId]
    }));
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Planning introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le planning a été créé sans base de données.</p>
          <a href="/gantt" style={{ color: ACCENT }}>Créer un nouveau planning</a>
        </div>
      </div>
    );
  }

  if (!state || !cpm) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture du planning…
      </div>
    );
  }

  const inputStyle = {
    padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444",
    borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            📅 {state.name || "Rétro-planning"}
          </h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager le planning"}
          </button>
        </header>

        {/* Avertissement de cycle */}
        {cpm.error === "cycle" && (
          <div style={{ background: "#2a1414", border: "1px solid #ff444455", borderRadius: 12, padding: "14px 18px", marginBottom: 20, color: "#ff8888", fontSize: 14 }}>
            ⚠️ Dépendance circulaire détectée (ex : A dépend de B qui dépend de A).
            Le chemin critique ne peut pas être calculé tant que le cycle n'est pas corrigé —
            revois les dépendances des tâches ci-dessous.
          </div>
        )}

        {/* Bannière chemin critique */}
        {cpm.error !== "cycle" && state.tasks.length > 0 && (
          <div style={{ background: "#111", border: `1px solid ${ACCENT}44`, borderRadius: 14, padding: "16px 20px", marginBottom: 22 }}>
            <div style={{ fontSize: 12.5, color: "#888", marginBottom: 6 }}>Durée totale du projet</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT, marginBottom: 10 }}>
              {cpm.projectDuration} jour{cpm.projectDuration > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 13, color: "#999" }}>
              Chemin critique :{" "}
              <strong style={{ color: "#fff" }}>{cpm.criticalPath.join(" → ") || "—"}</strong>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#666" }}>
              Un retard sur l'une de ces tâches retarde tout le projet — les autres tâches ont une marge.
            </p>
          </div>
        )}

        {/* Graphique de Gantt */}
        {state.tasks.length > 0 ? (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 16px", marginBottom: 22, overflowX: "auto" }}>
            <GanttChart tasks={cpm.tasks} projectDuration={Math.max(cpm.projectDuration, 1)} />
            <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, color: "#888" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: ACCENT, borderRadius: 2, marginRight: 6 }} />Chemin critique</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: NEUTRAL_BAR, borderRadius: 2, marginRight: 6 }} />Marge disponible</span>
            </div>
          </div>
        ) : (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "32px 16px", marginBottom: 22, textAlign: "center", color: "#555" }}>
            Ajoute une première tâche pour voir apparaître le planning.
          </div>
        )}

        {/* Ajout de tâche */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "16px 18px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>Ajouter une tâche</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: form.deps.length || state.tasks.length ? 10 : 0 }}>
            <input placeholder="Nom de la tâche" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inputStyle, flex: "2 1 200px" }} />
            <input placeholder="Durée (jours)" type="number" min="1" value={form.duration}
              onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addTask()}
              style={{ ...inputStyle, flex: "1 1 110px" }} />
            <button onClick={addTask}
              style={{ padding: "10px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 14 }}>
              + Ajouter
            </button>
          </div>
          {state.tasks.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Dépend de (optionnel) :</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {state.tasks.map(t => (
                  <label key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: form.deps.includes(t.id) ? "#e6394622" : "#1a1a2e",
                    border: `1px solid ${form.deps.includes(t.id) ? ACCENT : "#333"}`,
                    borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer",
                    color: form.deps.includes(t.id) ? ACCENT : "#999",
                  }}>
                    <input type="checkbox" checked={form.deps.includes(t.id)}
                      onChange={() => toggleFormDep(t.id)} style={{ display: "none" }} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tableau détaillé des tâches */}
        {state.tasks.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
            {cpm.tasks.map((t, i) => (
              <div key={t.id} style={{ padding: "12px 18px", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {t.critical && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                      CRITIQUE
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 14.5, color: "#ddd" }}>{t.name}</span>
                  <input type="number" min="1" value={t.duration}
                    onChange={e => updateDuration(t.id, e.target.value)}
                    style={{ width: 50, padding: "5px 6px", background: "#1a1a2e", border: "1px solid #333", borderRadius: 6, color: "#fff", fontSize: 13, textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: "#666" }}>j</span>
                  <span style={{ fontSize: 12.5, color: "#666", whiteSpace: "nowrap" }}>
                    J{t.es}→J{t.ef} {t.slack > 0 && <span style={{ color: "#00f5d4" }}>(marge {t.slack}j)</span>}
                  </span>
                  <button onClick={() => deleteTask(t.id)}
                    style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
                </div>
                <DependencyEditor task={t} allTasks={state.tasks} onChange={updateDeps} />
              </div>
            ))}
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 13, color: "#555" }}>
          Le planning se synchronise en direct entre tous ceux qui ont le lien ;
          le chemin critique est recalculé automatiquement à chaque modification.
        </p>

      </div>
    </div>
  );
}
