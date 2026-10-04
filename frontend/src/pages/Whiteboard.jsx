import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";
import { useDocumentMeta } from "../useDocumentMeta";

const ACCENT = "#4cc9f0";
const COLORS = ["#fee440", "#ff9f1c", "#f15bb5", "#00f5d4", "#4cc9f0", "#9b5de5", "#8ac926", "#ffffff"];
const BOX_TYPES = ["sticky", "text", "rect", "ellipse"];
const MIN_Z = 0.1, MAX_Z = 4;

const TOOLS = [
  { id: "select",  icon: "↖",  label: "Sélection (V)", key: "v" },
  { id: "hand",    icon: "✋", label: "Déplacer la vue (H ou Espace)", key: "h" },
  { id: "sticky",  icon: "🗒️", label: "Post-it (S)", key: "s" },
  { id: "text",    icon: "T",  label: "Texte (T)", key: "t" },
  { id: "rect",    icon: "▭",  label: "Rectangle (R)", key: "r" },
  { id: "ellipse", icon: "◯",  label: "Ellipse (O)", key: "o" },
  { id: "arrow",   icon: "➜",  label: "Flèche (A)", key: "a" },
  { id: "pencil",  icon: "✏️", label: "Crayon (P)", key: "p" },
  { id: "eraser",  icon: "🧽", label: "Gomme (E)", key: "e" },
];

const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function bounds(el) {
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
function TextEditor({ initial, align, onDone }) {
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
        resize: "none", color: "inherit", font: "inherit", textAlign: align, padding: 0,
      }}
    />
  );
}

function ElementView({ el, id, editing, onCommit }) {
  const common = { position: "absolute", left: el.x, top: el.y };

  if (el.type === "pencil" || el.type === "arrow") {
    const p = el.points;
    let d, head = null;
    if (el.type === "pencil") {
      d = "M" + p[0] + " " + p[1];
      for (let i = 2; i + 1 < p.length; i += 2) d += " L" + p[i] + " " + p[i + 1];
    } else {
      d = `M${p[0]} ${p[1]} L${p[2]} ${p[3]}`;
      const ang = Math.atan2(p[3] - p[1], p[2] - p[0]);
      const L = 12 + el.size * 2;
      const a1 = ang + Math.PI * 0.85, a2 = ang - Math.PI * 0.85;
      head = `${p[2]},${p[3]} ${p[2] + Math.cos(a1) * L},${p[3] + Math.sin(a1) * L} ${p[2] + Math.cos(a2) * L},${p[3] + Math.sin(a2) * L}`;
    }
    return (
      <svg width="1" height="1" style={{ ...common, overflow: "visible", pointerEvents: "none" }}>
        <g data-el={id}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(el.size, 16)} style={{ pointerEvents: "stroke" }} />
          <path d={d} fill="none" stroke={el.color} strokeWidth={el.size} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
          {head && <polygon points={head} fill={el.color} style={{ pointerEvents: "none" }} />}
        </g>
      </svg>
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
      {editing ? (
        <TextEditor initial={el.text} align={isSticky || isText ? "left" : "center"} onDone={v => onCommit(id, v)} />
      ) : el.text}
    </div>
  );
}

export default function Whiteboard() {
  const { id } = useParams();
  const [name, setName] = useState(null);
  const [elements, setElements] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState({ x: 80, y: 80, z: 1 });
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState(COLORS[0]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [cursors, setCursors] = useState({});
  const [copied, setCopied] = useState(false);
  const [myName, setMyName] = useState(() => {
    try { return localStorage.getItem("wb_name") || "Invité " + Math.floor(10 + Math.random() * 90); } catch { return "Invité"; }
  });

  useDocumentMeta(name ? `${name} — Tableau blanc` : "Tableau blanc", "Tableau blanc collaboratif en direct.");

  const boxRef = useRef(null);
  const viewRef = useRef(view);
  const elementsRef = useRef(elements);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const selectedRef = useRef(selected);
  const editingRef = useRef(editing);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const spaceRef = useRef(false);
  const lastSend = useRef(0);
  const lastCursor = useRef(0);
  const myNameRef = useRef(myName);
  const fitted = useRef(false);
  viewRef.current = view;
  elementsRef.current = elements;
  toolRef.current = tool;
  colorRef.current = color;
  selectedRef.current = selected;
  editingRef.current = editing;
  myNameRef.current = myName;

  // ─── Sync réseau ──────────────────────────────────────────────────────────
  const send = useCallback((elId, el) => socket.emit("whiteboard:upsert", { id, elId, el }), [id]);

  const fit = useCallback((els) => {
    const box = boxRef.current;
    const list = Object.values(els || elementsRef.current);
    if (!box || list.length === 0) { setView({ x: 80, y: 80, z: 1 }); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of list) {
      const b = bounds(el);
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    const W = box.clientWidth, H = box.clientHeight, pad = 60;
    const z = clamp(Math.min((W - pad * 2) / Math.max(1, x2 - x1), (H - pad * 2) / Math.max(1, y2 - y1)), MIN_Z, 1.5);
    setView({ z, x: (W - (x2 - x1) * z) / 2 - x1 * z, y: (H - (y2 - y1) * z) / 2 - y1 * z });
  }, []);

  useEffect(() => {
    const onState = (s) => {
      setName(s.name);
      setElements(s.elements || {});
      setLoaded(true);
      if (!fitted.current) { fitted.current = true; setTimeout(() => fit(s.elements), 0); }
    };
    const onUpsert = ({ elId, el }) => {
      if (dragRef.current && dragRef.current.id === elId) return;
      setElements(prev => ({ ...prev, [elId]: el }));
    };
    const onDelete = ({ elId }) => {
      setElements(prev => { const n = { ...prev }; delete n[elId]; return n; });
      setSelected(s => (s === elId ? null : s));
    };
    const onCursor = (c) => setCursors(prev => ({ ...prev, [c.sid]: { ...c, t: Date.now() } }));
    const onGone = ({ sid }) => setCursors(prev => { const n = { ...prev }; delete n[sid]; return n; });
    const open = () => socket.emit("whiteboard:open", { id });
    open();
    socket.on("whiteboard:state", onState);
    socket.on("whiteboard:upsert", onUpsert);
    socket.on("whiteboard:delete", onDelete);
    socket.on("whiteboard:cursor", onCursor);
    socket.on("whiteboard:cursorgone", onGone);
    socket.on("whiteboard:notfound", () => setNotFound(true));
    socket.on("connect", open);
    const prune = setInterval(() => {
      setCursors(prev => {
        const now = Date.now(); const n = {};
        let changed = false;
        for (const k in prev) { if (now - prev[k].t < 8000) n[k] = prev[k]; else changed = true; }
        return changed ? n : prev;
      });
    }, 3000);
    return () => {
      clearInterval(prune);
      socket.off("whiteboard:state", onState);
      socket.off("whiteboard:upsert", onUpsert);
      socket.off("whiteboard:delete", onDelete);
      socket.off("whiteboard:cursor", onCursor);
      socket.off("whiteboard:cursorgone", onGone);
      socket.off("whiteboard:notfound");
      socket.off("connect", open);
    };
  }, [id, fit]);

  useEffect(() => {
    if (!loaded) return;
    const existing = getLocalSessions().find(s => s.id === id && s.tool === "whiteboard");
    addLocalSession({ id, tool: "whiteboard", name, role: existing?.role || "guest" });
  }, [id, name, loaded]);

  // ─── Helpers d'édition ────────────────────────────────────────────────────
  const nextZ = () => Object.values(elementsRef.current).reduce((m, e) => Math.max(m, e.z || 0), 0) + 1;

  const putElement = useCallback((elId, el, sync = true) => {
    setElements(prev => ({ ...prev, [elId]: el }));
    elementsRef.current = { ...elementsRef.current, [elId]: el };
    if (sync) send(elId, el);
  }, [send]);

  const removeElement = useCallback((elId) => {
    setElements(prev => { const n = { ...prev }; delete n[elId]; return n; });
    const n = { ...elementsRef.current }; delete n[elId]; elementsRef.current = n;
    setSelected(s => (s === elId ? null : s));
    socket.emit("whiteboard:delete", { id, elId });
  }, [id]);

  const commitText = useCallback((elId, text) => {
    setEditing(null);
    const el = elementsRef.current[elId];
    if (!el) return;
    if (el.type === "text" && !text.trim()) return removeElement(elId);
    putElement(elId, { ...el, text });
  }, [putElement, removeElement]);

  const patchSelected = (patch) => {
    const el = elementsRef.current[selectedRef.current];
    if (el) putElement(selectedRef.current, { ...el, ...patch });
  };

  const duplicate = () => {
    const el = elementsRef.current[selectedRef.current];
    if (!el) return;
    const nid = rid();
    putElement(nid, { ...el, x: el.x + 24, y: el.y + 24, z: nextZ() });
    setSelected(nid);
  };

  const toWorld = (cx, cy) => {
    const r = boxRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  };

  const zoomAt = useCallback((factor, cx, cy) => {
    setView(v => {
      const z = clamp(v.z * factor, MIN_Z, MAX_Z);
      const k = z / v.z;
      return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // Molette = zoom autour du curseur (écouteur non passif pour bloquer le scroll de la page)
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoomAt, loaded]);

  // ─── Clavier ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.code === "Space") { spaceRef.current = true; e.preventDefault(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) {
        e.preventDefault(); removeElement(selectedRef.current); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { setSelected(null); setTool("select"); return; }
      const tl = TOOLS.find(x => x.key === e.key.toLowerCase());
      if (tl) setTool(tl.id);
    };
    const up = (e) => { if (e.code === "Space") spaceRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [removeElement]); // eslint-disable-line

  // ─── Pointeur ─────────────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.closest("[data-ui]")) return;
    boxRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {           // pincement tactile
      dragRef.current = null; setDraft(null);
      const [a, b] = [...pointers.current.values()];
      dragRef.current = {
        mode: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: { ...viewRef.current },
      };
      return;
    }
    if (pointers.current.size > 2) return;
    if (editingRef.current) { document.activeElement?.blur?.(); }

    const tl = toolRef.current;
    const w = toWorld(e.clientX, e.clientY);
    const hitEl = e.target.closest?.("[data-el]");
    const hitHandle = e.target.closest?.("[data-handle]");

    if (e.button === 1 || spaceRef.current || tl === "hand") {
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, view: { ...viewRef.current } };
      return;
    }

    if (tl === "select") {
      if (hitHandle && selectedRef.current) {
        const el = elementsRef.current[selectedRef.current];
        dragRef.current = { mode: "resize", id: selectedRef.current, wx: w.x, wy: w.y, ow: el.w, oh: el.h };
        return;
      }
      if (hitEl) {
        const elId = hitEl.getAttribute("data-el");
        const el = elementsRef.current[elId];
        if (!el) return;
        setSelected(elId);
        dragRef.current = { mode: "move", id: elId, wx: w.x, wy: w.y, ox: el.x, oy: el.y, moved: false };
        return;
      }
      setSelected(null);
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, view: { ...viewRef.current } };
      return;
    }

    if (tl === "eraser") {
      dragRef.current = { mode: "erase" };
      if (hitEl) removeElement(hitEl.getAttribute("data-el"));
      return;
    }

    if (tl === "sticky" || tl === "text") {
      const nid = rid();
      const el = tl === "sticky"
        ? { type: "sticky", x: w.x - 90, y: w.y - 80, w: 180, h: 160, text: "", color: colorRef.current, fs: 18, z: nextZ() }
        : { type: "text", x: w.x, y: w.y - 14, w: 240, h: 60, text: "", color: colorRef.current === "#fee440" ? "#ffffff" : colorRef.current, fs: 22, z: nextZ() };
      putElement(nid, el);
      setSelected(nid); setEditing(nid); setTool("select");
      return;
    }

    if (tl === "rect" || tl === "ellipse" || tl === "arrow") {
      dragRef.current = { mode: "draw", type: tl, sx: w.x, sy: w.y };
      setDraft(tl === "arrow"
        ? { type: "arrow", x: w.x, y: w.y, points: [0, 0, 0, 0], size: 3, color: colorRef.current, z: 0 }
        : { type: tl, x: w.x, y: w.y, w: 1, h: 1, text: "", color: colorRef.current, fs: 16, z: 0 });
      return;
    }

    if (tl === "pencil") {
      dragRef.current = { mode: "pencil", sx: w.x, sy: w.y };
      setDraft({ type: "pencil", x: w.x, y: w.y, points: [0, 0], size: 3, color: colorRef.current, z: 0 });
    }
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = dragRef.current;

    // curseur partagé (limité à ~16 envois/s)
    const now = Date.now();
    if (now - lastCursor.current > 60 && boxRef.current) {
      lastCursor.current = now;
      const w = toWorld(e.clientX, e.clientY);
      socket.emit("whiteboard:cursor", { id, x: w.x, y: w.y, name: myNameRef.current });
    }
    if (!d) return;

    if (d.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = boxRef.current.getBoundingClientRect();
      const z = clamp(d.view.z * dist / d.d, MIN_Z, MAX_Z);
      const k = z / d.view.z;
      const cx = d.cx - r.left, cy = d.cy - r.top;
      const ncx = (a.x + b.x) / 2 - r.left, ncy = (a.y + b.y) / 2 - r.top;
      setView({ z, x: ncx - (cx - d.view.x) * k, y: ncy - (cy - d.view.y) * k });
      return;
    }
    if (d.mode === "pan") {
      setView({ ...d.view, x: d.view.x + (e.clientX - d.sx), y: d.view.y + (e.clientY - d.sy) });
      return;
    }
    if (d.mode === "erase") {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-el]");
      if (hit) removeElement(hit.getAttribute("data-el"));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.mode === "move") {
      const el = elementsRef.current[d.id];
      if (!el) return;
      const nx = d.ox + (w.x - d.wx), ny = d.oy + (w.y - d.wy);
      if (!d.moved && Math.hypot(nx - d.ox, ny - d.oy) < 2 / viewRef.current.z) return;
      d.moved = true;
      const next = { ...el, x: nx, y: ny };
      const t = Date.now();
      const sync = t - lastSend.current > 50;
      if (sync) lastSend.current = t;
      putElement(d.id, next, sync);
      return;
    }
    if (d.mode === "resize") {
      const el = elementsRef.current[d.id];
      if (!el) return;
      const next = { ...el, w: Math.max(40, d.ow + (w.x - d.wx)), h: Math.max(30, d.oh + (w.y - d.wy)) };
      const t = Date.now();
      const sync = t - lastSend.current > 50;
      if (sync) lastSend.current = t;
      putElement(d.id, next, sync);
      return;
    }
    if (d.mode === "draw") {
      if (d.type === "arrow") setDraft(dr => dr && ({ ...dr, points: [0, 0, w.x - d.sx, w.y - d.sy] }));
      else setDraft(dr => dr && ({
        ...dr, x: Math.min(d.sx, w.x), y: Math.min(d.sy, w.y),
        w: Math.max(1, Math.abs(w.x - d.sx)), h: Math.max(1, Math.abs(w.y - d.sy)),
      }));
      return;
    }
    if (d.mode === "pencil") {
      setDraft(dr => {
        if (!dr) return dr;
        const p = dr.points;
        const lx = p[p.length - 2], ly = p[p.length - 1];
        const nx = w.x - d.sx, ny = w.y - d.sy;
        if (Math.hypot(nx - lx, ny - ly) < 2 / viewRef.current.z) return dr;
        return { ...dr, points: [...p, nx, ny] };
      });
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const d = dragRef.current;
    if (d && d.mode === "pinch") {
      if (pointers.current.size < 2) dragRef.current = null;
      return;
    }
    dragRef.current = null;
    if (!d) return;

    if (d.mode === "move" || d.mode === "resize") {
      const el = elementsRef.current[d.id];
      if (el && (d.mode === "resize" || d.moved)) send(d.id, el);
      return;
    }
    if (d.mode === "draw") {
      const dr = draftRef.current;
      setDraft(null);
      if (!dr) return;
      const nid = rid();
      if (dr.type === "arrow") {
        if (Math.hypot(dr.points[2], dr.points[3]) < 12) return;
        putElement(nid, { ...dr, z: nextZ() });
      } else {
        const small = dr.w < 8 && dr.h < 8;
        putElement(nid, { ...dr, w: small ? 160 : Math.max(30, dr.w), h: small ? 100 : Math.max(30, dr.h), z: nextZ() });
      }
      setSelected(nid); setTool("select");
      return;
    }
    if (d.mode === "pencil") {
      const dr = draftRef.current;
      setDraft(null);
      if (!dr) return;
      const pts = dr.points.length < 4 ? [...dr.points, 0.5, 0.5] : dr.points;
      putElement(rid(), { ...dr, points: pts, z: nextZ() });
    }
  };

  const draftRef = useRef(null);
  draftRef.current = draft;

  const onDoubleClick = (e) => {
    if (toolRef.current !== "select") return;
    // la capture du pointeur redirige l'événement vers le conteneur : on retrouve l'élément par position
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-el]");
    if (!hit) return;
    const elId = hit.getAttribute("data-el");
    const el = elementsRef.current[elId];
    if (el && BOX_TYPES.includes(el.type)) { setSelected(elId); setEditing(elId); }
  };

  const copy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rename = () => {
    const n = window.prompt("Ton nom affiché aux autres :", myName);
    if (n && n.trim()) {
      const v = n.trim().slice(0, 30);
      setMyName(v);
      try { localStorage.setItem("wb_name", v); } catch { /* ignoré */ }
    }
  };

  const clearAll = () => {
    if (!window.confirm("Effacer tout le tableau pour tout le monde ? Cette action est définitive.")) return;
    setElements({}); elementsRef.current = {}; setSelected(null);
    socket.emit("whiteboard:clear", { id });
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Tableau introuvable</h1>
          <p style={{ color: "#777" }}>Le lien est incorrect, ou le tableau a été créé sans base de données.</p>
          <a href="/whiteboard" style={{ color: ACCENT }}>Créer un nouveau tableau</a>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Ouverture du tableau…
      </div>
    );
  }

  const sorted = Object.entries(elements).sort((a, b) => (a[1].z || 0) - (b[1].z || 0));
  const selEl = selected ? elements[selected] : null;
  const selB = selEl ? bounds(selEl) : null;
  const handleSize = 16 / view.z;
  const btn = (active) => ({
    width: 38, height: 38, borderRadius: 9, border: "1px solid " + (active ? ACCENT : "#2a2a44"),
    background: active ? ACCENT + "33" : "#14142a", color: "#fff", fontSize: 17, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
  });
  const cursorStyle = tool === "select" ? "default" : tool === "hand" ? "grab" : tool === "eraser" ? "cell" : "crosshair";
  const gridSize = 28 * view.z;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0d0d1a", color: "#fff", overflow: "hidden" }}>

      <header data-ui style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #1c1c30", background: "#101022" }}>
        <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🧑‍🎨 {name || "Tableau blanc"}</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={rename} title="Changer ton nom affiché"
            style={{ padding: "6px 10px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#aaa", fontSize: 12.5, cursor: "pointer" }}>
            👤 {myName}
          </button>
          <button onClick={() => zoomAt(1 / 1.25, boxRef.current.clientWidth / 2, boxRef.current.clientHeight / 2)} style={{ ...btn(false), width: 30, height: 30 }}>−</button>
          <span style={{ fontSize: 12.5, color: "#888", width: 42, textAlign: "center" }}>{Math.round(view.z * 100)}%</span>
          <button onClick={() => zoomAt(1.25, boxRef.current.clientWidth / 2, boxRef.current.clientHeight / 2)} style={{ ...btn(false), width: 30, height: 30 }}>+</button>
          <button onClick={() => fit()} title="Tout voir" style={{ ...btn(false), width: 30, height: 30, fontSize: 14 }}>⤢</button>
          <button onClick={clearAll} title="Tout effacer"
            style={{ padding: "6px 10px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#ff6b6b", fontSize: 12.5, cursor: "pointer" }}>
            Tout effacer
          </button>
          <button onClick={copy}
            style={{ padding: "6px 12px", background: copied ? "#00f5d4" : "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: copied ? "#0d0d1a" : "#aaa", fontSize: 12.5, cursor: "pointer", fontWeight: 600 }}>
            {copied ? "✓ Lien copié" : "🔗 Partager"}
          </button>
        </div>
      </header>

      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{
          flex: 1, position: "relative", overflow: "hidden", touchAction: "none", cursor: cursorStyle,
          backgroundColor: "#0d0d1a",
          backgroundImage: "radial-gradient(#2a2a44 1.2px, transparent 1.2px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          {sorted.map(([elId, el]) => (
            <ElementView key={elId} id={elId} el={el} editing={editing === elId} onCommit={commitText} />
          ))}
          {draft && <ElementView id="__draft" el={draft} editing={false} onCommit={() => {}} />}

          {selB && !draft && (
            <div style={{
              position: "absolute", left: selB.x - 4, top: selB.y - 4, width: selB.w + 8, height: selB.h + 8,
              border: `${1.5 / view.z}px dashed ${ACCENT}`, pointerEvents: "none", boxSizing: "border-box",
            }}>
              {BOX_TYPES.includes(selEl.type) && (
                <div data-handle="1" style={{
                  position: "absolute", right: -handleSize / 2, bottom: -handleSize / 2,
                  width: handleSize, height: handleSize, background: ACCENT, borderRadius: 3,
                  cursor: "nwse-resize", pointerEvents: "auto",
                }} />
              )}
            </div>
          )}
        </div>

        {/* Curseurs des autres participants */}
        {Object.entries(cursors).map(([sid, c]) => (
          <div key={sid} style={{
            position: "absolute", left: c.x * view.z + view.x, top: c.y * view.z + view.y,
            pointerEvents: "none", transition: "left .08s linear, top .08s linear",
          }}>
            <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderBottom: "12px solid #ff6b9d", transform: "rotate(-30deg)" }} />
            <div style={{ background: "#ff6b9d", color: "#0d0d1a", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, marginLeft: 8, whiteSpace: "nowrap" }}>{c.name || "?"}</div>
          </div>
        ))}

        {/* Barre d'options de l'élément sélectionné */}
        {selEl && (
          <div data-ui style={{
            position: "absolute", left: "50%", bottom: 78, transform: "translateX(-50%)", maxWidth: "calc(100% - 20px)",
            display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", overflowX: "auto",
            background: "#14142aee", border: "1px solid #2a2a44", borderRadius: 12, backdropFilter: "blur(6px)",
          }}>
            {BOX_TYPES.includes(selEl.type) && (
              <>
                <button style={{ ...btn(false), width: 30, height: 30, fontSize: 12 }} title="Texte plus petit"
                  onClick={() => patchSelected({ fs: clamp(Math.round(selEl.fs * 0.85), 8, 120) })}>A−</button>
                <button style={{ ...btn(false), width: 30, height: 30, fontSize: 14 }} title="Texte plus grand"
                  onClick={() => patchSelected({ fs: clamp(Math.round(selEl.fs * 1.18), 8, 120) })}>A+</button>
              </>
            )}
            {(selEl.type === "arrow" || selEl.type === "pencil") && (
              <>
                <button style={{ ...btn(false), width: 30, height: 30, fontSize: 12 }} title="Trait plus fin"
                  onClick={() => patchSelected({ size: clamp(selEl.size - 1, 1, 24) })}>━</button>
                <button style={{ ...btn(false), width: 30, height: 30, fontSize: 16 }} title="Trait plus épais"
                  onClick={() => patchSelected({ size: clamp(selEl.size + 2, 1, 24) })}>▬</button>
              </>
            )}
            <button style={{ ...btn(false), width: 30, height: 30, fontSize: 14 }} title="Passer au premier plan"
              onClick={() => patchSelected({ z: nextZ() })}>⬆</button>
            <button style={{ ...btn(false), width: 30, height: 30, fontSize: 14 }} title="Dupliquer (Ctrl+D)" onClick={duplicate}>⧉</button>
            <button style={{ ...btn(false), width: 30, height: 30, fontSize: 14 }} title="Supprimer (Suppr)"
              onClick={() => removeElement(selected)}>🗑</button>
          </div>
        )}

        {/* Barre d'outils */}
        <div data-ui style={{
          position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", maxWidth: "calc(100% - 20px)",
          display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", overflowX: "auto",
          background: "#14142aee", border: "1px solid #2a2a44", borderRadius: 14, backdropFilter: "blur(6px)",
        }}>
          {TOOLS.map(t => (
            <button key={t.id} title={t.label} onClick={() => setTool(t.id)} style={btn(tool === t.id)}>{t.icon}</button>
          ))}
          <div style={{ width: 1, height: 26, background: "#2a2a44", margin: "0 4px", flexShrink: 0 }} />
          {COLORS.map(c => {
            const current = selEl ? selEl.color : color;
            return (
              <button key={c} title={c}
                onClick={() => { setColor(c); if (selEl) patchSelected({ color: c }); }}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c, flexShrink: 0, cursor: "pointer", padding: 0,
                  border: current.toLowerCase() === c ? "3px solid #fff" : "2px solid #0d0d1a",
                  boxShadow: current.toLowerCase() === c ? "0 0 0 1px " + ACCENT : "none",
                }} />
            );
          })}
        </div>

        {Object.keys(elements).length === 0 && !draft && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "38%", textAlign: "center", color: "#444", pointerEvents: "none", padding: "0 20px" }}>
            <div style={{ fontSize: 40 }}>🗒️</div>
            <div style={{ fontSize: 15, marginTop: 6 }}>Tableau vide — choisis le post-it 🗒️ en bas, puis clique ici.</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Molette = zoom · Espace + glisser = déplacer la vue · double-clic = éditer le texte</div>
          </div>
        )}
      </div>
    </div>
  );
}
