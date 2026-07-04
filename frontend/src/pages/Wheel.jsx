import { useState, useRef } from "react";

const COLORS = ["#00f5d4", "#f15bb5", "#fee440", "#9b5de5", "#00bbf9", "#ff9f1c", "#e63946", "#06d6a0", "#118ab2", "#ef476f", "#8ac926", "#ffca3a"];

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function describeSlice(cx, cy, r, startAngle, endAngle) {
  const p1 = polar(cx, cy, r, startAngle);
  const p2 = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

export default function Wheel() {
  const [names, setNames] = useState(["Alice", "Bob", "Claire"]);
  const [draft, setDraft] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const rotationRef = useRef(0);

  const addName = () => {
    if (!draft.trim() || names.length >= 12) return;
    setNames(list => [...list, draft.trim()]);
    setDraft("");
  };
  const removeName = (i) => setNames(list => list.filter((_, j) => j !== i));

  const spin = () => {
    if (names.length < 2 || spinning) return;
    setWinner(null);
    setSpinning(true);
    const n = names.length;
    const sliceAngle = 360 / n;
    const winnerIndex = Math.floor(Math.random() * n);
    const sliceCenter = winnerIndex * sliceAngle + sliceAngle / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const targetMod = (360 - sliceCenter + 360) % 360;
    const current = rotationRef.current;
    const currentMod = ((current % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta <= 0) delta += 360;
    const newRotation = current + delta + extraSpins * 360;
    rotationRef.current = newRotation;
    setRotation(newRotation);
    setTimeout(() => {
      setSpinning(false);
      setWinner(names[winnerIndex]);
    }, 4200);
  };

  const size = 320, cx = size / 2, cy = size / 2, r = size / 2 - 4;
  const sliceAngle = names.length > 0 ? 360 / names.length : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 16 }}>
          ← Retour aux outils
        </a>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 4 }}>🎡</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Roue de décision</h1>
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 14 }}>
            Qui anime le daily ? Qui fait la démo ? Laisse le hasard trancher.
          </p>
        </div>

        {/* Roue */}
        <div style={{ position: "relative", width: size, margin: "0 auto 24px" }}>
          {/* Aiguille fixe */}
          <div style={{
            position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent",
            borderTop: "18px solid #fff", zIndex: 2, filter: "drop-shadow(0 2px 3px #000a)",
          }} />
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <g style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: spinning ? "transform 4.2s cubic-bezier(0.15, 0.65, 0.15, 1)" : "none",
            }}>
              {names.map((name, i) => {
                const start = i * sliceAngle, end = start + sliceAngle;
                const mid = start + sliceAngle / 2;
                const labelPos = polar(cx, cy, r * 0.62, mid);
                return (
                  <g key={i}>
                    <path d={describeSlice(cx, cy, r, start, end)} fill={COLORS[i % COLORS.length]} stroke="#0d0d1a" strokeWidth="2" />
                    <text x={labelPos.x} y={labelPos.y} fill="#0d0d1a" fontSize="13" fontWeight="700"
                      textAnchor="middle" transform={`rotate(${mid}, ${labelPos.x}, ${labelPos.y})`}>
                      {name.length > 12 ? name.slice(0, 11) + "…" : name}
                    </text>
                  </g>
                );
              })}
            </g>
            <circle cx={cx} cy={cy} r="22" fill="#111" stroke="#333" strokeWidth="2" />
          </svg>
        </div>

        {winner && !spinning && (
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: "#888" }}>Résultat :</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#00f5d4" }}>🎉 {winner}</div>
          </div>
        )}

        <button onClick={spin} disabled={names.length < 2 || spinning}
          style={{
            width: "100%", padding: 16, borderRadius: 10, border: "none", fontWeight: "bold", fontSize: 17,
            background: names.length < 2 || spinning ? "#333" : "#00f5d4",
            color: names.length < 2 || spinning ? "#777" : "#0d0d1a",
            cursor: names.length < 2 || spinning ? "not-allowed" : "pointer",
            marginBottom: 24,
          }}>
          {spinning ? "La roue tourne…" : "Lancer la roue →"}
        </button>

        {/* Liste des noms */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "16px 18px" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 14, color: "#aaa" }}>Participants ({names.length}/12)</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {names.map((n, i) => (
              <span key={i} style={{
                display: "flex", alignItems: "center", gap: 6, background: "#1a1a2e",
                border: `1px solid ${COLORS[i % COLORS.length]}55`, borderRadius: 999, padding: "5px 10px", fontSize: 13,
              }}>
                {n}
                <button onClick={() => removeName(i)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
              </span>
            ))}
          </div>
          {names.length < 12 && (
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Ajouter un nom…" value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addName()}
                style={{ flex: 1, padding: "9px 12px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none" }} />
              <button onClick={addName}
                style={{ padding: "0 16px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: "#aaa", cursor: "pointer", fontSize: 14 }}>
                + Ajouter
              </button>
            </div>
          )}
        </div>

        <p style={{ marginTop: 18, fontSize: 12.5, color: "#444", textAlign: "center" }}>
          Aucune donnée sauvegardée — cette roue vit uniquement dans ton navigateur, le temps de la session.
        </p>

      </div>
    </div>
  );
}
