import { useEffect, useRef } from "react";

// Types d'éléments du tableau blanc et leur rendu.
export const TEXT_BOX_TYPES = ["sticky", "text", "rect", "ellipse", "diamond", "triangle", "hexagon", "star"];
export const BOX_TYPES = [...TEXT_BOX_TYPES, "frame", "table", "chart", "emoji"];
export const LINE_TYPES = ["arrow", "line", "pencil"];
export const CHART_COLORS = ["#4cc9f0", "#f15bb5", "#fee440", "#00f5d4", "#9b5de5", "#ff9f1c", "#8ac926", "#ff6b6b"];

export function bounds(el) {
  if (BOX_TYPES.includes(el.type)) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const p = el.points || [];
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (let i = 0; i + 1 < p.length; i += 2) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
  }
  return { x: el.x + minX, y: el.y + minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

// Zone de saisie : le focus est pris juste après le montage, sinon le clic
// qui vient de créer l'élément le lui reprend.
export function TextEditor({ initial, align, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current && ref.current.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      onBlur={e => onDone(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) e.target.blur();
        e.stopPropagation();
      }}
      style={{
        width: "100%", height: "100%", background: "transparent", border: "none", outline: "none",
        resize: "none", color: "inherit", font: "inherit", textAlign: align, padding: 0, userSelect: "text", WebkitUserSelect: "text",
      }}
    />
  );
}

// ─── Formes à polygone (viewBox 0-100) ──────────────────────────────────────
function starPoints() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 48 : 20;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
const POLYGONS = {
  diamond: "50,2 98,50 50,98 2,50",
  triangle: "50,4 97,96 3,96",
  hexagon: "25,4 75,4 98,50 75,96 25,96 2,50",
  star: starPoints(),
};

// ─── Données des graphiques : « Libellé: valeur », une ligne par donnée ─────
export function parseSeries(text) {
  let title = null;
  const data = [];
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith("#")) { if (title === null) title = l.replace(/^#+\s*/, ""); continue; }
    const m = l.match(/^(.*?)\s*[:;=]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (m) data.push({ label: m[1].trim() || "?", value: parseFloat(m[2].replace(",", ".")) });
  }
  return { title, data };
}

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmtNum = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function Chart({ el }) {
  const W = Math.max(60, el.w), H = Math.max(60, el.h);
  const { title, data } = parseSeries(el.text);
  const top = title ? 38 : 16, bottom = el.kind === "pie" || el.kind === "donut" ? 14 : 34, left = 14, right = 14;
  const innerW = W - left - right, innerH = H - top - bottom;
  const vals = data.map(d => Math.max(0, d.value));
  const maxV = Math.max(1, ...vals);
  const txt = { fontFamily: "system-ui, sans-serif" };

  const body = [];
  if (data.length === 0) {
    body.push(<text key="e" x={W / 2} y={H / 2} textAnchor="middle" fill="#777" fontSize="14" {...txt}>Double-clique pour saisir les données</text>);
  } else if (el.kind === "bar") {
    const slot = innerW / data.length, bw = Math.min(60, slot * 0.62);
    body.push(<line key="ax" x1={left} x2={W - right} y1={top + innerH} y2={top + innerH} stroke="#444" />);
    data.forEach((d, i) => {
      const h = (vals[i] / maxV) * (innerH - 16);
      const x = left + slot * i + (slot - bw) / 2, y = top + innerH - h;
      body.push(
        <g key={i}>
          <rect x={x} y={y} width={bw} height={h} rx="3" fill={CHART_COLORS[i % CHART_COLORS.length]} />
          <text x={x + bw / 2} y={y - 5} textAnchor="middle" fill="#ddd" fontSize="12" fontWeight="700" {...txt}>{fmtNum(d.value)}</text>
          <text x={x + bw / 2} y={top + innerH + 16} textAnchor="middle" fill="#aaa" fontSize="11" {...txt}>{trunc(d.label, Math.max(5, Math.floor(slot / 6.5)))}</text>
        </g>
      );
    });
  } else if (el.kind === "line") {
    const n = data.length;
    const px = i => left + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const py = v => top + innerH - (Math.max(0, v) / maxV) * (innerH - 16);
    body.push(<line key="ax" x1={left} x2={W - right} y1={top + innerH} y2={top + innerH} stroke="#444" />);
    body.push(<polyline key="pl" fill="none" stroke="#4cc9f0" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
      points={data.map((d, i) => `${px(i)},${py(d.value)}`).join(" ")} />);
    data.forEach((d, i) => {
      body.push(
        <g key={i}>
          <circle cx={px(i)} cy={py(d.value)} r="5" fill="#0d0d1a" stroke="#4cc9f0" strokeWidth="3" />
          <text x={px(i)} y={py(d.value) - 10} textAnchor="middle" fill="#ddd" fontSize="12" fontWeight="700" {...txt}>{fmtNum(d.value)}</text>
          <text x={px(i)} y={top + innerH + 16} textAnchor="middle" fill="#aaa" fontSize="11" {...txt}>{trunc(d.label, Math.max(5, Math.floor(innerW / Math.max(1, n) / 6.5)))}</text>
        </g>
      );
    });
  } else {                                   // pie / donut
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const R = Math.max(20, Math.min(innerH, innerW * 0.55) / 2);
    const cx = left + R + 4, cy = top + innerH / 2;
    let a0 = -Math.PI / 2;
    data.forEach((d, i) => {
      const frac = vals[i] / total, a1 = a0 + frac * Math.PI * 2, color = CHART_COLORS[i % CHART_COLORS.length];
      if (frac >= 0.9999) body.push(<circle key={i} cx={cx} cy={cy} r={R} fill={color} />);
      else if (frac > 0) {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        body.push(<path key={i} fill={color} stroke="#14142a" strokeWidth="2"
          d={`M${cx} ${cy} L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`} />);
      }
      a0 = a1;
    });
    if (el.kind === "donut") body.push(<circle key="hole" cx={cx} cy={cy} r={R * 0.55} fill="#14142a" />);
    const lx = cx + R + 22;
    data.slice(0, 10).forEach((d, i) => {
      const ly = top + 14 + i * 20;
      if (ly > H - 8) return;
      body.push(
        <g key={"l" + i}>
          <rect x={lx} y={ly - 10} width="12" height="12" rx="3" fill={CHART_COLORS[i % CHART_COLORS.length]} />
          <text x={lx + 18} y={ly} fill="#ddd" fontSize="12" {...txt}>{trunc(d.label, Math.max(6, Math.floor((W - lx - 60) / 6.5)))} · {Math.round((vals[i] / total) * 100)}%</text>
        </g>
      );
    });
  }

  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, display: "block" }}>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="12" fill="#14142a" stroke="#2a2a44" />
      {title && <text x={W / 2} y="25" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="700" {...txt}>{trunc(title, Math.floor(W / 8.5))}</text>}
      {body}
    </svg>
  );
}

function Table({ el }) {
  const rows = String(el.text || "").split("\n").map(r => r.split("|").map(c => c.trim()));
  const cols = Math.max(1, ...rows.map(r => r.length));
  return (
    <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: el.fs, color: "#e8e8f0" }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j} style={{
                border: `1px solid ${el.color}66`, padding: "3px 8px", overflow: "hidden", wordBreak: "break-word", verticalAlign: "middle",
                background: i === 0 ? el.color + "33" : "transparent", fontWeight: i === 0 ? 700 : 400,
              }}>{r[j] || ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Rendu d'un élément ─────────────────────────────────────────────────────
export function ElementView({ el, id, editing, onCommit }) {
  const common = { position: "absolute", left: el.x, top: el.y };

  if (LINE_TYPES.includes(el.type)) {
    const p = el.points;
    let d, head = null;
    if (el.type === "pencil") {
      d = "M" + p[0] + " " + p[1];
      for (let i = 2; i + 1 < p.length; i += 2) d += " L" + p[i] + " " + p[i + 1];
    } else {
      d = `M${p[0]} ${p[1]} L${p[2]} ${p[3]}`;
      if (el.type === "arrow") {
        const ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
        const L = 12 + el.size * 2;
        const a1 = ang + Math.PI * 0.85, a2 = ang - Math.PI * 0.85;
        head = `${p[2]},${p[3]} ${p[2] + Math.cos(a1) * L},${p[3] + Math.sin(a1) * L} ${p[2] + Math.cos(a2) * L},${p[3] + Math.sin(a2) * L}`;
      }
    }
    return (
      <svg width="1" height="1" style={{ ...common, overflow: "visible", pointerEvents: "none" }}>
        <g data-el={id}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(el.size, 16)} style={{ pointerEvents: "stroke" }} />
          <path d={d} fill="none" stroke={el.color} strokeWidth={el.size} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={el.hl ? 0.4 : 1} style={{ pointerEvents: "none" }} />
          {head && <polygon points={head} fill={el.color} style={{ pointerEvents: "none" }} />}
        </g>
      </svg>
    );
  }

  if (el.type === "frame") {
    return (
      <div style={{ ...common, width: el.w, height: el.h, boxSizing: "border-box", pointerEvents: "none",
        border: `2px dashed ${el.color}99`, background: el.color + "0d", borderRadius: 12 }}>
        <div data-el={id} style={{
          position: "absolute", left: -2, top: -2, maxWidth: "100%", boxSizing: "border-box", padding: "5px 12px",
          background: el.color, color: "#0d0d1a", fontWeight: 700, fontSize: el.fs, borderRadius: "10px 10px 10px 0",
          pointerEvents: "auto", cursor: "grab", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", userSelect: "none",
        }}>{el.text || "Cadre"}</div>
      </div>
    );
  }

  if (el.type === "emoji") {
    return (
      <div data-el={id} style={{ ...common, width: el.w, height: el.h, fontSize: el.fs, lineHeight: `${el.h}px`, textAlign: "center", userSelect: "none", fontFamily: "system-ui, sans-serif" }}>
        {el.text}
      </div>
    );
  }

  if (el.type === "chart") {
    return <div data-el={id} style={{ ...common, width: el.w, height: el.h }}><Chart el={el} /></div>;
  }

  if (el.type === "table") {
    return (
      <div data-el={id} style={{ ...common, width: el.w, height: el.h, overflow: "hidden", borderRadius: 8, border: `2px solid ${el.color}`, background: "#14142a", boxSizing: "border-box", fontFamily: "system-ui, sans-serif" }}>
        <Table el={el} />
      </div>
    );
  }

  if (POLYGONS[el.type]) {
    const top = el.type === "triangle" ? "38%" : "10%";
    return (
      <div data-el={id} style={{ ...common, width: el.w, height: el.h, fontSize: el.fs, lineHeight: 1.25, color: "#fff", fontFamily: "system-ui, sans-serif", userSelect: "none" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <polygon points={POLYGONS[el.type]} fill={el.color + "22"} stroke={el.color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div style={{ position: "absolute", left: "16%", right: "16%", top, bottom: "10%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", wordBreak: "break-word", whiteSpace: "pre-wrap", overflow: "hidden" }}>
          {editing ? <TextEditor initial={el.text} align="center" onDone={v => onCommit(id, v)} /> : el.text}
        </div>
      </div>
    );
  }

  const isSticky = el.type === "sticky";
  const isText = el.type === "text";
  const style = {
    ...common, width: el.w, height: el.h, boxSizing: "border-box",
    fontSize: el.fs, lineHeight: 1.3, overflow: "hidden", wordBreak: "break-word", whiteSpace: "pre-wrap",
    userSelect: "none", fontFamily: "system-ui, sans-serif",
  };
  if (isSticky) Object.assign(style, { background: el.color, color: "#1a1a2e", padding: 12, borderRadius: 4, boxShadow: "0 6px 14px rgba(0,0,0,.45)" });
  else if (isText) Object.assign(style, { color: el.color, padding: 4 });
  else Object.assign(style, {
    border: `3px solid ${el.color}`, background: el.color + "22", color: "#fff", padding: 8,
    borderRadius: el.type === "ellipse" ? "50%" : 8, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
  });

  return (
    <div data-el={id} style={style}>
      {editing
        ? <TextEditor initial={el.text} align={isSticky || isText ? "left" : "center"} onDone={v => onCommit(id, v)} />
        : el.text}
    </div>
  );
}
