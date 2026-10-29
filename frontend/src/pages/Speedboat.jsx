import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";
import { useDocumentMeta } from "../useDocumentMeta";

const ACCENT = "#00bbf9";
const W = 1000, H = 600;                 // espace de coordonnées de la scène
const NOTE_W = 130, NOTE_H = 96;
const COLORS = [
  "#fee440", "#ffd6a5", "#ff9f1c", "#ff6b6b", "#f15bb5", "#ffb3d9",
  "#c8a2ff", "#9b5de5", "#4cc9f0", "#00bbf9", "#00f5d4", "#8ac926",
  "#caffbf", "#ffffff", "#b8c0cc", "#2b2d42",
];
const darkNote = (c) => c.toLowerCase() === "#2b2d42" || c.toLowerCase() === "#9b5de5";

// Zones de la scène : où atterrit un nouveau post-it, et ce qu'elle représente
const ZONES = [
  { id: "wind",   icon: "💨", label: "Vent",    hint: "ce qui nous propulse",  box: [30, 40, 380, 190],  color: "#00f5d4" },
  { id: "island", icon: "🏝️", label: "Île",     hint: "notre objectif",        box: [690, 40, 280, 180], color: "#fee440" },
  { id: "anchor", icon: "⚓", label: "Ancres",  hint: "ce qui nous freine",    box: [30, 370, 470, 200], color: "#ff6b6b" },
  { id: "rock",   icon: "🪨", label: "Rochers", hint: "les risques à venir",   box: [560, 370, 410, 200], color: "#ff9f1c" },
];

const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tilt = (id) => ((id.charCodeAt(0) + id.charCodeAt(3)) % 5) - 2;   // -2° à +2°, stable

// ─── Illustration : tout est dessiné en SVG, aucune image externe ────────────
function Scene() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, display: "block" }}>
      <defs>
        <linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10224a" /><stop offset="1" stopColor="#2a5d8f" />
        </linearGradient>
        <linearGradient id="sb-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b6f9a" /><stop offset="1" stopColor="#081a33" />
        </linearGradient>
      </defs>

      <rect width={W} height="300" fill="url(#sb-sky)" />
      <rect y="300" width={W} height="300" fill="url(#sb-sea)" />

      {/* soleil */}
      <circle cx="880" cy="95" r="34" fill="#ffd166" opacity=".9" />

      {/* vent : rafales */}
      <g stroke="#bff4ff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".75">
        <path d="M60 90 H190 C215 90 215 62 192 62" />
        <path d="M100 140 H270 C298 140 298 112 272 112" />
        <path d="M40 195 H150 C172 195 172 172 152 172" />
        <path d="M250 70 H360 C382 70 382 46 362 46" />
      </g>

      {/* île */}
      <path d="M690 305 C730 262 800 248 860 252 C930 250 975 275 1000 305 Z" fill="#e8c46d" />
      <path d="M690 305 H1000 V312 H690 Z" fill="#c9a24d" />
      <g>
        <path d="M850 262 C846 225 852 190 868 150" stroke="#7a4b21" strokeWidth="9" fill="none" strokeLinecap="round" />
        <g fill="#3aa655">
          <path d="M868 150 C830 128 800 140 780 160 C815 150 840 152 868 150Z" />
          <path d="M868 150 C900 118 935 124 955 148 C925 140 900 144 868 150Z" />
          <path d="M868 150 C850 110 870 85 900 78 C888 105 880 125 868 150Z" />
          <path d="M868 150 C835 150 812 175 806 200 C825 178 845 165 868 150Z" />
        </g>
      </g>

      {/* mer : reflets */}
      <g stroke="#7fd4f5" strokeWidth="2" fill="none" opacity=".35" strokeLinecap="round">
        <path d="M30 330 q20 -10 40 0 t40 0 t40 0" />
        <path d="M520 345 q20 -10 40 0 t40 0 t40 0" />
        <path d="M160 420 q20 -10 40 0 t40 0" />
        <path d="M640 330 q20 -10 40 0 t40 0 t40 0" />
        <path d="M380 560 q20 -10 40 0 t40 0" />
      </g>
      <path d="M0 300 q25 -14 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 V318 H0 Z" fill="#3b9fd0" opacity=".55" />

      {/* sillage + hors-bord */}
      <g>
        <path d="M330 305 Q250 300 190 312 Q250 322 330 318 Z" fill="#fff" opacity=".6" />
        <path d="M330 320 Q270 330 215 342 Q280 342 345 332 Z" fill="#fff" opacity=".35" />
        <path d="M335 268 H585 Q625 268 655 244 L640 300 Q630 318 600 318 H360 Q338 318 335 296 Z" fill="#f4f6fb" />
        <path d="M335 296 Q338 318 360 318 H600 Q630 318 640 300 L645 282 H335 Z" fill="#e63946" />
        <path d="M335 282 H645" stroke="#fff" strokeWidth="4" />
        <path d="M470 268 L500 220 H560 L585 268 Z" fill="#9fdcf5" stroke="#f4f6fb" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="395" cy="298" r="7" fill="#9fdcf5" />
        <circle cx="425" cy="298" r="7" fill="#9fdcf5" />
        <path d="M655 244 L700 232" stroke="#f4f6fb" strokeWidth="4" strokeLinecap="round" />
        <path d="M345 318 Q330 330 300 335" stroke="#fff" strokeWidth="6" fill="none" opacity=".7" strokeLinecap="round" />
      </g>

      {/* ancres, accrochées sous la coque */}
      <g stroke="#9aa7b8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {[{ x: 400, y: 505 }, { x: 470, y: 535 }, { x: 540, y: 495 }].map((a, i) => (
          <g key={i}>
            <path d={`M${a.x} 318 V${a.y - 38}`} strokeDasharray="2 6" />
            <circle cx={a.x} cy={a.y - 32} r="6" />
            <path d={`M${a.x} ${a.y - 26} V${a.y + 18}`} strokeWidth="5" />
            <path d={`M${a.x - 12} ${a.y - 10} H${a.x + 12}`} strokeWidth="5" />
            <path d={`M${a.x - 22} ${a.y + 2} Q${a.x - 20} ${a.y + 22} ${a.x} ${a.y + 20} Q${a.x + 20} ${a.y + 22} ${a.x + 22} ${a.y + 2}`} strokeWidth="5" />
          </g>
        ))}
      </g>

      {/* rochers */}
      <g>
        <path d="M600 600 L640 470 L690 520 L735 430 L800 520 L850 480 L900 600 Z" fill="#3a4658" />
        <path d="M735 430 L760 480 L720 500 Z" fill="#566377" />
        <path d="M900 600 L930 520 L975 560 L1000 530 V600 Z" fill="#323c4b" />
        <path d="M700 340 L722 318 L748 326 L762 348 Z" fill="#4a566a" />
        <path d="M692 348 Q730 356 772 348" stroke="#fff" strokeWidth="3" fill="none" opacity=".6" strokeLinecap="round" />
      </g>

      {/* étiquettes des zones */}
      <g fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="15" letterSpacing="1.5">
        {ZONES.map(z => (
          <text key={z.id} x={z.box[0] + 6} y={z.box[1] - 8} fill={z.color} opacity=".9">
            {z.icon} {z.label.toUpperCase()} · <tspan fontWeight="500" fontSize="13" letterSpacing="0.3">{z.hint}</tspan>
          </text>
        ))}
      </g>
    </svg>
  );
}

function NoteEditor({ initial, onDone }) {
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
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); e.target.blur(); }
        e.stopPropagation();
      }}
      style={{ width: "100%", height: "100%", background: "transparent", border: "none", outline: "none", resize: "none", color: "inherit", font: "inherit", padding: 0 }}
    />
  );
}

export default function Speedboat() {
  const { id } = useParams();
  const [name, setName] = useState(null);
  const [notes, setNotes] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);

  useDocumentMeta(name ? `${name} — Speed Boat` : "Speed Boat", "Rétrospective Speed Boat collaborative.");

  const outerRef = useRef(null);
  const sceneRef = useRef(null);
  const notesRef = useRef(notes);
  const dragRef = useRef(null);
  const lastSend = useRef(0);
  const scaleRef = useRef(scale);
  const selectedRef = useRef(selected);
  notesRef.current = notes;
  scaleRef.current = scale;
  selectedRef.current = selected;

  const send = useCallback((elId, el) => socket.emit("whiteboard:upsert", { id, elId, el }), [id]);

  // La scène (1000×600) s'adapte à la largeur disponible ; en dessous de 720 px on scrolle
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(clamp(el.clientWidth, 720, 1500) / W));
    ro.observe(el);
    setScale(clamp(el.clientWidth, 720, 1500) / W);
    return () => ro.disconnect();
  }, [loaded]);

  useEffect(() => {
    const onState = (s) => { setName(s.name); setNotes(s.elements || {}); setLoaded(true); };
    const onUpsert = ({ elId, el }) => {
      if (dragRef.current && dragRef.current.id === elId) return;
      setNotes(prev => ({ ...prev, [elId]: el }));
    };
    const onDelete = ({ elId }) => {
      setNotes(prev => { const n = { ...prev }; delete n[elId]; return n; });
      setSelected(s => (s === elId ? null : s));
    };
    const open = () => socket.emit("whiteboard:open", { id });
    open();
    socket.on("whiteboard:state", onState);
    socket.on("whiteboard:upsert", onUpsert);
    socket.on("whiteboard:delete", onDelete);
    socket.on("whiteboard:notfound", () => setNotFound(true));
    socket.on("connect", open);
    return () => {
      socket.off("whiteboard:state", onState);
      socket.off("whiteboard:upsert", onUpsert);
      socket.off("whiteboard:delete", onDelete);
      socket.off("whiteboard:notfound");
      socket.off("connect", open);
    };
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "speedboat");
    addLocalSession({ id, tool: "speedboat", name, role: existing?.role || "guest" });
  }, [id, name, loaded]);

  const put = useCallback((elId, el, sync = true) => {
    setNotes(prev => ({ ...prev, [elId]: el }));
    notesRef.current = { ...notesRef.current, [elId]: el };
    if (sync) send(elId, el);
  }, [send]);

  const remove = useCallback((elId) => {
    setNotes(prev => { const n = { ...prev }; delete n[elId]; return n; });
    const n = { ...notesRef.current }; delete n[elId]; notesRef.current = n;
    setSelected(s => (s === elId ? null : s));
    socket.emit("whiteboard:delete", { id, elId });
  }, [id]);

  const nextZ = () => Object.values(notesRef.current).reduce((m, e) => Math.max(m, e.z || 0), 0) + 1;

  const addNote = (zone) => {
    const [bx, by, bw, bh] = zone.box;
    const nid = rid();
    const el = {
      type: "sticky", color, text: "", fs: 15, w: NOTE_W, h: NOTE_H, z: nextZ(),
      x: Math.round(bx + Math.random() * Math.max(0, bw - NOTE_W)),
      y: Math.round(by + 10 + Math.random() * Math.max(0, bh - NOTE_H - 10)),
    };
    put(nid, el);
    setSelected(nid); setEditing(nid);
  };

  const commitText = (elId, text) => {
    setEditing(null);
    const el = notesRef.current[elId];
    if (!el) return;
    if (!text.trim()) return remove(elId);
    put(elId, { ...el, text: text.slice(0, 400) });
  };

  const setNoteColor = (c) => {
    setColor(c);
    const el = notesRef.current[selectedRef.current];
    if (el) put(selectedRef.current, { ...el, color: c });
  };

  // ─── Glisser-déposer ──────────────────────────────────────────────────────
  const toScene = (e) => {
    const r = sceneRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scaleRef.current, y: (e.clientY - r.top) / scaleRef.current };
  };

  const onNoteDown = (e, elId) => {
    if (editing === elId) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const el = notesRef.current[elId];
    const p = toScene(e);
    setSelected(elId);
    dragRef.current = { id: elId, dx: p.x - el.x, dy: p.y - el.y, moved: false };
  };
  const onNoteMove = (e) => {
    const d = dragRef.current;
    if (!d || d.mode === "resize") return;   // les mouvements de la poignée remontent jusqu'ici
    const el = notesRef.current[d.id];
    if (!el) return;
    const p = toScene(e);
    const nx = clamp(Math.round(p.x - d.dx), 0, W - el.w), ny = clamp(Math.round(p.y - d.dy), 0, H - el.h);
    if (!d.moved && Math.hypot(nx - el.x, ny - el.y) < 3) return;
    d.moved = true;
    const t = Date.now();
    const sync = t - lastSend.current > 60;
    if (sync) lastSend.current = t;
    put(d.id, { ...el, x: nx, y: ny, z: d.raised ? el.z : nextZ() }, sync);
    d.raised = true;
  };
  const onNoteUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.moved) { const el = notesRef.current[d.id]; if (el) send(d.id, el); }
  };

  // ─── Redimensionnement (poignée en bas à droite) ───────────────────────────
  const onResizeDown = (e, elId) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const el = notesRef.current[elId];
    const p = toScene(e);
    setSelected(elId);
    dragRef.current = { id: elId, mode: "resize", sx: p.x, sy: p.y, ow: el.w, oh: el.h, moved: false };
  };
  const onResizeMove = (e) => {
    const d = dragRef.current;
    if (!d || d.mode !== "resize") return;
    const el = notesRef.current[d.id];
    if (!el) return;
    const p = toScene(e);
    const w = clamp(Math.round(d.ow + p.x - d.sx), 80, Math.min(420, W - el.x));
    const h = clamp(Math.round(d.oh + p.y - d.sy), 60, Math.min(320, H - el.y));
    d.moved = true;
    const fs = clamp(Math.round(15 * Math.sqrt((w * h) / (NOTE_W * NOTE_H))), 11, 38);
    const t = Date.now();
    const sync = t - lastSend.current > 60;
    if (sync) lastSend.current = t;
    put(d.id, { ...el, w, h, fs }, sync);
  };

  useEffect(() => {
    const key = (e) => {
      if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) { e.preventDefault(); remove(selectedRef.current); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [remove]);

  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const clearAll = () => {
    if (!window.confirm("Effacer tous les post-its pour tout le monde ? Cette action est définitive.")) return;
    setNotes({}); notesRef.current = {}; setSelected(null);
    socket.emit("whiteboard:clear", { id });
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Rétrospective introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou elle a été créée sans base de données.</p>
          <a href="/speedboat" style={{ color: ACCENT }}>Créer une nouvelle rétrospective</a>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Mise à l'eau du bateau…
      </div>
    );
  }

  const list = Object.entries(notes).sort((a, b) => (a[1].z || 0) - (b[1].z || 0));
  const selNote = selected ? notes[selected] : null;
  const count = (zone) => {
    const [bx, by, bw, bh] = zone.box;
    return list.filter(([, n]) => n.x + n.w / 2 >= bx - 20 && n.x + n.w / 2 <= bx + bw + 20 && n.y + n.h / 2 >= by - 20 && n.y + n.h / 2 <= by + bh + 20).length;
  };
  const pill = (c) => ({
    padding: "8px 14px", background: c + "1f", border: `1px solid ${c}`, borderRadius: 999,
    color: c, fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "18px 16px 40px" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🚤 {name || "Speed Boat"}</h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={clearAll}
              style={{ padding: "7px 12px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#ff6b6b", fontSize: 13, cursor: "pointer" }}>
              Tout effacer
            </button>
            <button onClick={copy}
              style={{ padding: "7px 14px", background: copied ? "#00f5d4" : "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              {copied ? "✓ Lien copié" : "🔗 Inviter l'équipe"}
            </button>
          </div>
        </header>

        {/* Ajout de post-its par zone + couleur */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#777", marginRight: 2 }}>Ajouter un post-it :</span>
          {ZONES.map(z => (
            <button key={z.id} onClick={() => addNote(z)} style={pill(z.color)}>
              {z.icon} {z.label} <span style={{ opacity: .7, fontWeight: 500 }}>({count(z)})</span>
            </button>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, marginLeft: "auto", maxWidth: 420, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 12.5, color: "#777" }}>{selNote ? "Couleur du post-it" : "Couleur"} :</span>
            {COLORS.map(c => {
              const cur = (selNote ? selNote.color : color).toLowerCase() === c;
              return (
                <button key={c} onClick={() => setNoteColor(c)} title={c}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", padding: 0, border: cur ? "3px solid #fff" : "2px solid #555", boxShadow: cur ? `0 0 0 1px ${ACCENT}` : "none" }} />
              );
            })}
            {selNote && (
              <button onClick={() => remove(selected)} title="Supprimer le post-it (Suppr)"
                style={{ marginLeft: 6, padding: "5px 10px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#ff6b6b", fontSize: 13, cursor: "pointer" }}>
                🗑
              </button>
            )}
          </div>
        </div>

        {/* Scène */}
        <div ref={outerRef} style={{ width: "100%", overflowX: "auto", borderRadius: 16, border: "1px solid #222" }}>
          <div
            ref={sceneRef}
            onPointerDown={() => { setSelected(null); document.activeElement?.blur?.(); }}
            style={{ position: "relative", width: W * scale, height: H * scale, overflow: "hidden", touchAction: "none" }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `scale(${scale})` }}>
              <Scene />
              {list.map(([elId, n]) => (
                <div
                  key={elId}
                  onPointerDown={e => onNoteDown(e, elId)}
                  onPointerMove={onNoteMove}
                  onPointerUp={onNoteUp}
                  onPointerCancel={onNoteUp}
                  onDoubleClick={() => { setSelected(elId); setEditing(elId); }}
                  style={{
                    position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box",
                    background: n.color, color: darkNote(n.color) ? "#fff" : "#1a1a2e", padding: "9px 20px 9px 9px", borderRadius: 4,
                    fontSize: n.fs, lineHeight: 1.25, fontFamily: "system-ui, sans-serif",
                    boxShadow: selected === elId ? `0 0 0 3px ${ACCENT}, 0 8px 18px rgba(0,0,0,.55)` : "0 6px 12px rgba(0,0,0,.5)",
                    transform: `rotate(${tilt(elId)}deg)`, cursor: editing === elId ? "text" : "grab", userSelect: "none", touchAction: "none",
                  }}
                >
                  <div style={{ width: "100%", height: "100%", overflow: "hidden", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {editing === elId ? <NoteEditor initial={n.text} onDone={v => commitText(elId, v)} /> : n.text}
                  </div>

                  {/* petite poubelle, coin haut droit */}
                  <button
                    title="Supprimer ce post-it"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); remove(elId); }}
                    style={{
                      position: "absolute", top: 3, right: 3, width: 20, height: 20, padding: 0, border: "none", borderRadius: 4,
                      background: "rgba(0,0,0,.18)", color: "inherit", fontSize: 12, lineHeight: "20px", cursor: "pointer",
                      opacity: selected === elId ? 1 : .55,
                    }}
                  >🗑</button>

                  {/* poignée de redimensionnement, coin bas droit */}
                  <div
                    title="Redimensionner"
                    onPointerDown={e => onResizeDown(e, elId)}
                    onPointerMove={onResizeMove}
                    onPointerUp={onNoteUp}
                    onPointerCancel={onNoteUp}
                    style={{
                      position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", touchAction: "none",
                      background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,.35) 50%)", borderBottomRightRadius: 4,
                      opacity: selected === elId ? 1 : .6,
                    }}
                  />
                </div>
              ))}
            </div>

            {list.length === 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "46%", textAlign: "center", color: "#cfe9f7", pointerEvents: "none", textShadow: "0 1px 6px #000" }}>
                Choisis une zone ci-dessus pour poser ton premier post-it 🚤
              </div>
            )}
          </div>
        </div>

        <p style={{ margin: "12px 2px 0", fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          Glisse un post-it pour le déplacer · tire le coin bas droit pour le redimensionner · double-clic pour modifier le texte ·
          🗑 ou Suppr pour l'effacer · Entrée valide. Tout le monde voit les changements en direct.
        </p>
      </div>
    </div>
  );
}
