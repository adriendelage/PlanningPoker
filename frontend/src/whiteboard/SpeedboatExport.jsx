import { useMemo, useState } from "react";
import socket from "../socket";
import { addLocalSession } from "../localHistory";

// Exporte un modèle « Speed Boat » du tableau blanc vers une vraie session Speed Boat (nouveau lien) :
// chaque post-it posé dans un cadre Vent / Ancres / Rochers / Île est rangé dans la zone correspondante.

const ACCENT = "#00bbf9";
const W = 1000, H = 600;
const ZONES = {
  wind:   { icon: "💨", label: "Vent",    box: [30, 40, 380, 190] },
  island: { icon: "🏝️", label: "Île",     box: [690, 40, 280, 180] },
  anchor: { icon: "⚓", label: "Ancres",  box: [30, 370, 470, 200] },
  rock:   { icon: "🪨", label: "Rochers", box: [560, 370, 410, 200] },
};
const SIZES = [{ w: 120, h: 88, fs: 14 }, { w: 84, h: 60, fs: 11 }];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function zoneOf(title) {
  const t = norm(title);
  if (/\b(vent|wind)\b/.test(t)) return "wind";
  if (/\b(ancres?|anchors?)\b/.test(t)) return "anchor";
  if (/\b(rochers?|recifs?|rocks?|risques?)\b/.test(t)) return "rock";
  if (/\b(ile|island|objectif)\b/.test(t)) return "island";
  return null;
}

// Post-it rangés par zone d'après le cadre qui les contient (centre du post-it dans le cadre)
export function collectSpeedboat(elements) {
  const frames = Object.entries(elements).filter(([, e]) => e.type === "frame" && zoneOf(e.text)).map(([id, e]) => ({ id, e, zone: zoneOf(e.text) }));
  const byZone = { wind: [], island: [], anchor: [], rock: [] };
  let outside = 0;
  for (const [, el] of Object.entries(elements)) {
    if (el.type !== "sticky" || !el.text || !el.text.trim()) continue;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    const f = frames.find(f => cx >= f.e.x && cx <= f.e.x + f.e.w && cy >= f.e.y && cy <= f.e.y + f.e.h);
    if (f) byZone[f.zone].push(el); else outside++;
  }
  for (const z of Object.keys(byZone)) byZone[z].sort((a, b) => a.y - b.y || a.x - b.x);
  return { zones: new Set(frames.map(f => f.zone)), byZone, outside };
}

function layoutZone(notes, zoneId, author) {
  const [bx, by, bw, bh] = ZONES[zoneId].box;
  const gap = 8, top = by + 14, avail = bh - 14;
  let size = SIZES[1], cols = 1, rows = notes.length;
  for (const s of SIZES) {
    const c = Math.max(1, Math.floor((bw + gap) / (s.w + gap)));
    const r = Math.ceil(notes.length / c);
    size = s; cols = c; rows = r;
    if (r * (s.h + gap) - gap <= avail) break;
  }
  const stepX = size.w + gap;
  const stepY = rows > 1 ? Math.min(size.h + gap, (avail - size.h) / (rows - 1)) : 0;
  return notes.map((n, i) => ({
    type: "sticky", color: n.color, text: n.text.trim().slice(0, 400), author: n.author || author, fs: size.fs, w: size.w, h: size.h,
    x: Math.round(bx + (i % cols) * stepX), y: Math.round(top + Math.floor(i / cols) * stepY),
  }));
}

const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const overlay = { position: "fixed", inset: 0, background: "rgba(5,5,15,.78)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const card = { width: "100%", maxWidth: 520, background: "#111", border: "1px solid #2a2a44", borderRadius: 16, padding: "20px 22px", color: "#fff", fontFamily: "system-ui, sans-serif" };
const btnP = { background: ACCENT, color: "#0d0d1a", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const btnG = { background: "#14142a", color: "#ccc", border: "1px solid #2a2a44", borderRadius: 9, padding: "9px 14px", fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-block" };

export default function SpeedboatExport({ elements, boardName, myName, onClose }) {
  const data = useMemo(() => collectSpeedboat(elements), [elements]);
  const total = Object.values(data.byZone).reduce((t, a) => t + a.length, 0);
  const [name, setName] = useState((boardName ? boardName + " — " : "") + "Speed Boat");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    socket.emit("whiteboard:create", { name: name.trim() || "Speed Boat", hostName: myName, tool: "speedboat" }, (sid) => {
      let z = 1;
      for (const zoneId of Object.keys(ZONES)) {
        for (const el of layoutZone(data.byZone[zoneId], zoneId, myName)) {
          socket.emit("whiteboard:upsert", { id: sid, elId: rid(), el: { ...el, z: z++ } });
        }
      }
      addLocalSession({ id: sid, tool: "speedboat", name: name.trim() || "Speed Boat", role: "host" });
      setResult(sid);
    });
  };
  const url = result ? `${window.location.origin}/speedboat/${result}` : "";

  return (
    <div data-ui style={overlay} onPointerDown={e => e.stopPropagation()} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>🚤 Exporter en Speed Boat</h2>
        {!result ? (
          <>
            <p style={{ color: "#aaa", fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
              Crée une session Speed Boat avec un nouveau lien et y range tes post-it selon leur cadre.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {Object.entries(ZONES).map(([k, z]) => (
                <div key={k} style={{ background: "#1a1a2e", border: "1px solid #2a2a44", borderRadius: 10, padding: "8px 12px", fontSize: 14, opacity: data.zones.has(k) ? 1 : 0.45 }}>
                  {z.icon} {z.label} <strong style={{ float: "right", color: ACCENT }}>{data.byZone[k].length}</strong>
                </div>
              ))}
            </div>
            {data.outside > 0 && <p style={{ color: "#ff9f1c", fontSize: 12.5, margin: "0 0 10px" }}>⚠️ {data.outside} post-it hors des cadres ne seront pas exportés.</p>}
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Nom du Speed Boat"
              style={{ width: "100%", boxSizing: "border-box", background: "#0d0d1a", border: "1px solid #2a2a44", borderRadius: 8, color: "#fff", padding: "9px 11px", fontSize: 14, marginBottom: 14, outline: "none" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={create} disabled={total === 0} style={{ ...btnP, opacity: total ? 1 : 0.5 }}>Créer le Speed Boat ({total})</button>
              <button onClick={onClose} style={btnG}>Annuler</button>
            </div>
            {total === 0 && <p style={{ color: "#888", fontSize: 12.5, marginTop: 10 }}>Aucun post-it dans les cadres Vent / Ancres / Rochers / Île.</p>}
          </>
        ) : (
          <>
            <p style={{ color: "#00f5d4", fontWeight: 600, margin: "0 0 10px" }}>✓ Speed Boat créé avec {total} post-it.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0, background: "#0d0d1a", border: "1px solid #2a2a44", borderRadius: 8, color: ACCENT, padding: "8px 10px", fontSize: 13, fontFamily: "monospace" }} />
              <button style={btnG} onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "✓ Copié" : "Copier"}</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={`/speedboat/${result}`} target="_blank" rel="noreferrer" style={btnP}>Ouvrir le Speed Boat</a>
              <a href={`/speedboat/${result}?export=1`} target="_blank" rel="noreferrer" style={btnG}>📷 Ouvrir et télécharger l'image</a>
              <button onClick={onClose} style={btnG}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
