import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";

const ACCENT = "#ff6b9d";
const MOODS = [
  { value: 1, emoji: "😞" }, { value: 2, emoji: "😕" }, { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" }, { value: 5, emoji: "😄" },
];

function moodColor(m) {
  if (m >= 4) return "#00f5d4";
  if (m >= 3) return "#fee440";
  return "#ff4444";
}

// ─── Courbe de tendance (SVG fait main) ──────────────────────────────────────
function PulseChart({ days }) {
  const W = 640, H = 220;
  const padL = 30, padR = 16, padT = 16, padB = 30;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const stepX = days.length > 1 ? chartW / (days.length - 1) : 0;
  const yOf = v => padT + chartH - ((v - 1) / 4) * chartH; // échelle 1-5

  const points = days.map((d, i) => ({ x: padL + i * stepX, y: yOf(d.avg), day: d.day, avg: d.avg }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[1, 2, 3, 4, 5].map(v => (
        <line key={v} x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="#1c1c30" strokeWidth="1" />
      ))}
      <path d={path} fill="none" stroke={ACCENT} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.5" fill={moodColor(p.avg)} stroke="#0d0d1a" strokeWidth="1.5" />
          {(days.length <= 14 || i % Math.ceil(days.length / 10) === 0) && (
            <text x={p.x} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#666">
              {p.day.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export default function Pulse() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [selectedMood, setSelectedMood] = useState(null);

  useEffect(() => {
    socket.emit("pulse:open", { id });
    socket.on("pulse:state", setState);
    socket.on("pulse:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("pulse:open", { id });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("pulse:state", setState);
      socket.off("pulse:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id]);

  useEffect(() => {
    if (!state) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "pulse");
    addLocalSession({ id, tool: "pulse", name: state.name, role: existing?.role || "guest" });
  }, [id, state?.name]);

  const checkin = () => {
    if (!name.trim() || !selectedMood) return alert("Indique ton nom et ton humeur du jour");
    socket.emit("pulse:checkin", { id, name, mood: selectedMood });
  };
  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const days = useMemo(() => {
    if (!state) return [];
    const byDay = {};
    state.entries.forEach(e => {
      (byDay[e.day] ||= []).push(e.mood);
    });
    return Object.keys(byDay).sort().map(day => ({
      day, avg: byDay[day].reduce((a, b) => a + b, 0) / byDay[day].length,
    }));
  }, [state]);

  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = state?.entries.filter(e => e.day === today) || [];

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Tableau introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le tableau a été créé sans base de données.</p>
          <a href="/pulse" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
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
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>💓 {state.name || "Pouls d'équipe"}</h1>
          <button onClick={copy}
            style={{ marginLeft: "auto", padding: "7px 14px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </header>

        {/* Check-in du jour */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "#aaa" }}>Ton humeur aujourd'hui</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input placeholder="Ton prénom" value={name} onChange={e => setName(e.target.value)}
              style={{ flex: 1, padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
            {MOODS.map(m => (
              <button key={m.value} onClick={() => setSelectedMood(m.value)}
                style={{
                  fontSize: 30, width: 54, height: 54, borderRadius: 12, cursor: "pointer",
                  background: selectedMood === m.value ? `${ACCENT}33` : "#1a1a2e",
                  border: `2px solid ${selectedMood === m.value ? ACCENT : "#333"}`,
                }}>{m.emoji}</button>
            ))}
          </div>
          <button onClick={checkin}
            style={{ width: "100%", padding: "12px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 15 }}>
            Valider mon check-in
          </button>
          {todayEntries.length > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#666" }}>
              Aujourd'hui : {todayEntries.map(e => `${e.name} ${MOODS.find(m => m.value === e.mood)?.emoji}`).join(" · ")}
            </p>
          )}
        </div>

        {/* Tendance */}
        {days.length > 0 ? (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 16px" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>Tendance de l'équipe</h2>
            <PulseChart days={days} />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#555", textAlign: "center" }}>Aucun check-in pour l'instant.</p>
        )}

      </div>
    </div>
  );
}
