import { useState, useMemo } from "react";
import { WB_TEMPLATES, WB_TEMPLATE_CATEGORIES } from "./templates";
import { bounds } from "./shapes";

const ACCENT = "#4cc9f0";

// Miniature automatique d'un modèle, dessinée à partir de ses éléments
function Thumb({ elements }) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of elements) {
    const b = bounds(e);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  const pad = 20, vw = x2 - x1 + pad * 2, vh = y2 - y1 + pad * 2;
  return (
    <svg viewBox={`${x1 - pad} ${y1 - pad} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
      {elements.map((e, i) => {
        const b = bounds(e);
        switch (e.type) {
          case "frame": return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="14" fill={e.color + "18"} stroke={e.color} strokeWidth={Math.max(4, vw / 150)} strokeDasharray="14 10" />;
          case "sticky": return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" fill={e.color} />;
          case "text": return <rect key={i} x={b.x} y={b.y + b.h / 2 - 7} width={Math.min(b.w, e.text.length * e.fs * 0.55)} height="14" rx="5" fill="#8a8fa8" />;
          case "ellipse": return <ellipse key={i} cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill={e.color + "33"} stroke={e.color} strokeWidth="6" />;
          case "diamond": return <polygon key={i} points={`${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}`} fill={e.color + "33"} stroke={e.color} strokeWidth="6" />;
          case "table": return <g key={i}><rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill="#14142a" stroke={e.color} strokeWidth="6" />{[1, 2, 3].map(k => <line key={k} x1={b.x} x2={b.x + b.w} y1={b.y + (b.h * k) / 4} y2={b.y + (b.h * k) / 4} stroke={e.color + "88"} strokeWidth="4" />)}</g>;
          case "chart": return <g key={i}><rect x={b.x} y={b.y} width={b.w} height={b.h} rx="12" fill="#14142a" stroke="#2a2a44" strokeWidth="4" />{e.kind === "pie" || e.kind === "donut"
            ? <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={Math.min(b.w, b.h) / 3} fill="none" stroke="#f15bb5" strokeWidth={Math.min(b.w, b.h) / 4} strokeDasharray="120 400" />
            : [0.3, 0.55, 0.4, 0.8].map((v, k) => <rect key={k} x={b.x + b.w * (0.12 + k * 0.21)} y={b.y + b.h * (0.9 - v * 0.7)} width={b.w * 0.13} height={b.h * v * 0.7} fill="#4cc9f0" />)}</g>;
          case "emoji": return <circle key={i} cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={b.w / 2.4} fill="#fee440" />;
          case "arrow": case "line": return <line key={i} x1={e.x} y1={e.y} x2={e.x + e.points[2]} y2={e.y + e.points[3]} stroke={e.color} strokeWidth="6" strokeLinecap="round" />;
          default: return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill={e.color + "33"} stroke={e.color} strokeWidth="6" />;
        }
      })}
    </svg>
  );
}

export default function TemplatePicker({ onPick, onClose }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const items = useMemo(() => WB_TEMPLATES.map(t => ({ ...t, elements: t.build() })), []);
  const shown = items.filter(t =>
    (cat === "all" || t.category === cat) &&
    (!q.trim() || (t.name + " " + t.desc).toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div data-ui onPointerDown={e => e.stopPropagation()} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(5,5,15,.78)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 1040, maxHeight: "90vh", background: "#101022", border: "1px solid #2a2a44", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", color: "#fff", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #1c1c30" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📋 Modèles</h2>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un modèle…"
            style={{ flex: 1, padding: "9px 12px", background: "#1a1a2e", border: "1px solid #333", borderRadius: 9, color: "#fff", fontSize: 14, outline: "none", userSelect: "text" }} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "10px 18px", flexWrap: "wrap", borderBottom: "1px solid #1c1c30" }}>
          {WB_TEMPLATE_CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ padding: "6px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: cat === c.id ? ACCENT + "26" : "#14142a", border: `1px solid ${cat === c.id ? ACCENT : "#2a2a44"}`, color: cat === c.id ? ACCENT : "#aaa" }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ overflowY: "auto", padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gridAutoRows: "max-content", alignContent: "start", gap: 14, flex: 1, minHeight: 0 }}>
          {shown.map(t => (
            <button key={t.id} onClick={() => onPick(t)}
              style={{ textAlign: "left", padding: 0, display: "block", width: "100%", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 12, overflow: "hidden", cursor: "pointer", color: "#fff" }}>
              <div style={{ height: 130, background: "#0d0d1a", padding: 8, boxSizing: "border-box" }}><Thumb elements={t.elements} /></div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{t.icon} {t.name}</div>
                <div style={{ fontSize: 12, color: "#888", lineHeight: 1.35 }}>{t.desc}</div>
              </div>
            </button>
          ))}
          {shown.length === 0 && <p style={{ color: "#666", gridColumn: "1 / -1", textAlign: "center" }}>Aucun modèle ne correspond.</p>}
        </div>
      </div>
    </div>
  );
}
