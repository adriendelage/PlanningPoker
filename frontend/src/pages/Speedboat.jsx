import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";
import { useDocumentMeta } from "../useDocumentMeta";

const ACCENT = "#00bbf9";
const W = 1000, H = 600;                 // espace de coordonnées de la scène
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOTE_W = 120, NOTE_H = 88;      // taille « M » par défaut
const SIZES = [
  { id: "S", label: "S", w: 84,  h: 60,  fs: 11 },
  { id: "M", label: "M", w: 120, h: 88,  fs: 14 },
  { id: "L", label: "L", w: 170, h: 124, fs: 19 },
];
const fsFor = (w, h) => clamp(Math.round(14 * Math.sqrt((w * h) / (NOTE_W * NOTE_H))), 7, 38);
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

// ─── Export en image (PNG) ──────────────────────────────────────────────────
// Le décor SVG est converti en image, puis les post-its sont dessinés par-dessus
// directement sur le canvas (pas de bibliothèque, rien ne quitte le navigateur).
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      line = "";
      let chunk = "";                      // mot plus long que la ligne : on coupe
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxW && chunk) { lines.push(chunk); chunk = ""; }
        chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

async function exportPng(svgEl, noteList, title) {
  const K = 2, HEADER = 56;                // résolution ×2, bandeau de titre
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", W); clone.setAttribute("height", H);
  clone.removeAttribute("style");
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  const canvas = document.createElement("canvas");
  canvas.width = W * K; canvas.height = (H + HEADER) * K;
  const ctx = canvas.getContext("2d");
  ctx.scale(K, K);
  ctx.fillStyle = "#0d0d1a"; ctx.fillRect(0, 0, W, H + HEADER);

  ctx.fillStyle = "#ffffff"; ctx.font = "700 24px system-ui, sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText("🚤 " + (title || "Speed Boat"), 18, HEADER / 2);
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = "#8a8fa8"; ctx.font = "500 15px system-ui, sans-serif"; ctx.textAlign = "right";
  ctx.fillText(date, W - 18, HEADER / 2); ctx.textAlign = "left";

  ctx.drawImage(img, 0, HEADER, W, H);
  ctx.translate(0, HEADER);

  for (const [elId, n] of noteList) {
    ctx.save();
    ctx.translate(n.x + n.w / 2, n.y + n.h / 2);
    ctx.rotate((tilt(elId) * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
    ctx.fillStyle = n.color; roundRect(ctx, -n.w / 2, -n.h / 2, n.w, n.h, 4); ctx.fill();
    ctx.shadowColor = "transparent";

    const dark = darkNote(n.color);
    const small = n.w < 90;
    const padL = small ? 5 : 9, padT = small ? 4 : 9, padR = small ? 14 : 20;
    const padB = small ? 4 : n.h < 60 ? 6 : 19;
    ctx.save();
    roundRect(ctx, -n.w / 2, -n.h / 2, n.w, n.h, 4); ctx.clip();
    ctx.fillStyle = dark ? "#ffffff" : "#1a1a2e";
    ctx.font = `${n.fs}px system-ui, sans-serif`; ctx.textBaseline = "top";
    const lh = n.fs * 1.25, maxLines = Math.max(1, Math.floor((n.h - padT - padB) / lh));
    wrapLines(ctx, n.text, n.w - padL - padR).slice(0, maxLines).forEach((ln, i) => {
      ctx.fillText(ln, -n.w / 2 + padL, -n.h / 2 + padT + i * lh);
    });
    if (n.author && n.w >= 90 && n.h >= 60) {
      ctx.globalAlpha = 0.5; ctx.font = "600 10px system-ui, sans-serif"; ctx.textBaseline = "alphabetic";
      let a = n.author;
      while (a.length > 1 && ctx.measureText(a).width > n.w - 31) a = a.slice(0, -1);
      ctx.fillText(a, -n.w / 2 + 7, n.h / 2 - 6);
    }
    ctx.restore();
    ctx.restore();
  }

  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("export impossible");
  return blob;
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
      style={{ width: "100%", height: "100%", background: "transparent", border: "none", outline: "none", resize: "none", color: "inherit", font: "inherit", padding: 0, userSelect: "text", WebkitUserSelect: "text" }}
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
  const [size, setSize] = useState("M");
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [myName, setMyName] = useState(() => {
    try { return localStorage.getItem("sb_name") || ""; } catch { return ""; }
  });
  const [nameDraft, setNameDraft] = useState("");

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

  const saveName = (v) => {
    const n = v.trim().slice(0, 30);
    if (!n) return;
    setMyName(n);
    try { localStorage.setItem("sb_name", n); } catch { /* ignoré */ }
  };
  const rename = () => {
    const n = window.prompt("Ton nom affiché sur tes post-its :", myName);
    if (n) saveName(n);
  };

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

  const addNoteAt = (cx, cy) => {
    const nid = rid();
    const sz = SIZES.find(z => z.id === size) || SIZES[1];
    const el = {
      type: "sticky", color, text: "", author: myName, fs: sz.fs, w: sz.w, h: sz.h, z: nextZ(),
      x: clamp(Math.round(cx - sz.w / 2), 0, W - sz.w),
      y: clamp(Math.round(cy - sz.h / 2), 0, H - sz.h),
    };
    put(nid, el);
    setSelected(nid); setEditing(nid);
  };

  // Bouton d'une zone : pose le post-it à un endroit aléatoire de cette zone
  const addNote = (zone) => {
    const [bx, by, bw, bh] = zone.box;
    addNoteAt(
      bx + NOTE_W / 2 + Math.random() * Math.max(0, bw - NOTE_W),
      by + 10 + NOTE_H / 2 + Math.random() * Math.max(0, bh - NOTE_H - 10),
    );
  };

  const commitText = (elId, text) => {
    setEditing(null);
    const el = notesRef.current[elId];
    if (!el) return;
    if (!text.trim()) return remove(elId);
    put(elId, { ...el, text: text.slice(0, 400) });
  };

  const applySize = (sz) => {
    setSize(sz.id);
    const el = notesRef.current[selectedRef.current];
    if (!el) return;
    put(selectedRef.current, {
      ...el, w: sz.w, h: sz.h, fs: sz.fs,
      x: clamp(el.x, 0, W - sz.w), y: clamp(el.y, 0, H - sz.h),
    });
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
  // Clic sur le décor : pose un post-it à cet endroit. Si un post-it était sélectionné
  // ou en cours d'édition, le premier clic sert seulement à le désélectionner.
  const sceneClick = useRef(null);
  const onSceneDown = (e) => {
    sceneClick.current = { x: e.clientX, y: e.clientY, blocked: !!(selected || editing) };
    setSelected(null);
    document.activeElement?.blur?.();
  };
  const onSceneUp = (e) => {
    const c = sceneClick.current;
    sceneClick.current = null;
    if (!c || c.blocked || !myName) return;
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > 6) return;
    const p = toScene(e);
    addNoteAt(p.x, p.y);
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
    const w = clamp(Math.round(d.ow + p.x - d.sx), 48, Math.min(420, W - el.x));
    const h = clamp(Math.round(d.oh + p.y - d.sy), 34, Math.min(320, H - el.y));
    d.moved = true;
    const fs = fsFor(w, h);
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

  const [exporting, setExporting] = useState(false);
  const exportImage = async () => {
    const svg = sceneRef.current && sceneRef.current.querySelector("svg");
    if (!svg) return;
    setExporting(true);
    try {
      setSelected(null);
      const blob = await exportPng(svg, Object.entries(notesRef.current).sort((a, b) => (a[1].z || 0) - (b[1].z || 0)), name);
      const slug = (name || "speedboat").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "speedboat";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `speedboat-${slug}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      console.error(err);
      alert("L'export en image a échoué sur ce navigateur.");
    } finally {
      setExporting(false);
    }
  };

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
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "18px 16px 40px", userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🚤 {name || "Speed Boat"}</h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={rename} title="Changer ton nom affiché"
              style={{ padding: "7px 12px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer" }}>
              👤 {myName || "Ton nom"}
            </button>
            <button onClick={exportImage} disabled={exporting} title="Télécharger le speedboat en image PNG"
              style={{ padding: "7px 12px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#ddd", fontSize: 13, cursor: exporting ? "default" : "pointer", fontWeight: 600 }}>
              {exporting ? "Export…" : "📷 Exporter en image"}
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
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <span style={{ fontSize: 12.5, color: "#777", marginRight: 2 }}>Taille :</span>
            {SIZES.map(z => {
              const cur = selNote ? (selNote.w === z.w && selNote.h === z.h) : size === z.id;
              return (
                <button key={z.id} onClick={() => applySize(z)} title={`Taille ${z.label}`}
                  style={{ width: 28, height: 28, borderRadius: 7, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 700,
                    background: cur ? ACCENT + "33" : "#14142a", color: cur ? ACCENT : "#aaa", border: `1px solid ${cur ? ACCENT : "#2a2a44"}` }}>
                  {z.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5, maxWidth: 420, justifyContent: "flex-end" }}>
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
            onPointerDown={onSceneDown}
            onPointerUp={onSceneUp}
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
                    background: n.color, color: darkNote(n.color) ? "#fff" : "#1a1a2e", padding: n.w < 90 ? "4px 14px 4px 5px" : n.h < 60 ? "6px 22px 6px 8px" : "9px 20px 19px 9px", borderRadius: 4,
                    fontSize: n.fs, lineHeight: 1.25, fontFamily: "system-ui, sans-serif",
                    boxShadow: selected === elId ? `0 0 0 3px ${ACCENT}, 0 8px 18px rgba(0,0,0,.55)` : "0 6px 12px rgba(0,0,0,.5)",
                    transform: `rotate(${tilt(elId)}deg)`, cursor: editing === elId ? "text" : "grab", userSelect: "none", touchAction: "none",
                  }}
                >
                  <div style={{ width: "100%", height: "100%", overflow: "hidden", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {editing === elId ? <NoteEditor initial={n.text} onDone={v => commitText(elId, v)} /> : n.text}
                  </div>

                  {n.author && n.w >= 90 && n.h >= 60 && (
                    <div style={{
                      position: "absolute", left: 7, bottom: 3, right: 24, fontSize: 10, lineHeight: "13px", opacity: .5,
                      fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none",
                    }}>{n.author}</div>
                  )}

                  {/* petite poubelle, coin haut droit */}
                  <button
                    title="Supprimer ce post-it"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); remove(elId); }}
                    style={{
                      position: "absolute", top: 2, right: 2, width: n.w < 90 ? 14 : 20, height: n.w < 90 ? 14 : 20, padding: 0, border: "none", borderRadius: 4,
                      background: "rgba(0,0,0,.18)", color: "inherit", fontSize: n.w < 90 ? 9 : 12, lineHeight: n.w < 90 ? "14px" : "20px", cursor: "pointer",
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
                      position: "absolute", right: 0, bottom: 0, width: n.w < 90 ? 14 : 18, height: n.w < 90 ? 14 : 18, cursor: "nwse-resize", touchAction: "none",
                      background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,.35) 50%)", borderBottomRightRadius: 4,
                      opacity: selected === elId ? 1 : .6,
                    }}
                  />
                </div>
              ))}
            </div>

            {list.length === 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "46%", textAlign: "center", color: "#cfe9f7", pointerEvents: "none", textShadow: "0 1px 6px #000" }}>
                Clique n'importe où sur l'image pour poser ton premier post-it 🚤
              </div>
            )}
          </div>
        </div>

        {!myName && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(5,5,15,.82)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <form onSubmit={e => { e.preventDefault(); saveName(nameDraft); }}
              style={{ width: "100%", maxWidth: 380, background: "#111", border: "1px solid #2a2a44", borderRadius: 16, padding: "26px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 40 }}>🚤</div>
              <h2 style={{ margin: "6px 0 4px", fontSize: 20 }}>Comment t'appelles-tu ?</h2>
              <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#777" }}>Ton nom apparaîtra discrètement sur les post-its que tu poses.</p>
              <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={30} placeholder="Ex: Alice"
                style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", marginBottom: 14, background: "#1a1a2e", border: "1px solid #444", borderRadius: 10, color: "#fff", fontSize: 16, outline: "none" }} />
              <button type="submit"
                style={{ width: "100%", padding: 14, background: ACCENT, border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 16, color: "#0d0d1a" }}>
                Monter à bord →
              </button>
            </form>
          </div>
        )}

        <p style={{ margin: "12px 2px 0", fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          Clique sur l'image pour poser un post-it · glisse-le pour le déplacer · tire le coin bas droit (ou choisis S / M / L) pour le redimensionner · double-clic pour modifier le texte ·
          🗑 ou Suppr pour l'effacer · Entrée valide. Tout le monde voit les changements en direct.
        </p>
      </div>
    </div>
  );
}
