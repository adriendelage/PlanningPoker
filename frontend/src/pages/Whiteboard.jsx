import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../socket";
import { addLocalSession, getLocalSessions } from "../localHistory";
import { useDocumentMeta } from "../useDocumentMeta";
import { ElementView, BOX_TYPES, TEXT_BOX_TYPES, LINE_TYPES, bounds } from "../whiteboard/shapes";
import TemplatePicker from "../whiteboard/TemplatePicker";

const ACCENT = "#4cc9f0";
const COLORS = ["#fee440", "#ff9f1c", "#ff6b6b", "#f15bb5", "#c8a2ff", "#4cc9f0", "#00f5d4", "#8ac926", "#ffffff", "#9aa7b8"];
const MIN_Z = 0.1, MAX_Z = 4;

const SHAPES = [
  { id: "rect", icon: "▭", label: "Rectangle (R)" },
  { id: "ellipse", icon: "◯", label: "Ellipse (O)" },
  { id: "diamond", icon: "◇", label: "Losange (D)" },
  { id: "triangle", icon: "△", label: "Triangle" },
  { id: "hexagon", icon: "⬡", label: "Hexagone" },
  { id: "star", icon: "☆", label: "Étoile" },
];
const CONNECTORS = [
  { id: "arrow", icon: "➜", label: "Flèche (A)" },
  { id: "line", icon: "╱", label: "Ligne (L)" },
];
const CHARTS = [
  { id: "bar", icon: "📊", label: "Histogramme" },
  { id: "line", icon: "📈", label: "Courbe" },
  { id: "pie", icon: "🥧", label: "Camembert" },
  { id: "donut", icon: "🍩", label: "Anneau" },
];
const EMOJIS = ["👍", "👎", "❤️", "⭐", "🔥", "💡", "✅", "❌", "❓", "❗", "🎯", "🚀", "🐞", "🔒", "⏰", "🏆", "😀", "😐", "😢", "😡", "🎉", "🙏", "👀", "🔵"];

const KEYS = { v: "select", h: "hand", s: "sticky", t: "text", r: "rect", o: "ellipse", d: "diamond", a: "arrow", l: "line", p: "pencil", i: "highlighter", q: "lasso", f: "frame", b: "table", g: "chart", e: "eraser", x: "eraserInk" };
const PEN_SIZES = [2, 4, 8];
const HL_SIZES = [14, 22, 34];
const PEN_TOOLS = ["pencil", "highlighter", "eraser", "eraserInk", "lasso"];
const pointInPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const SAMPLE_CHART = "# Titre du graphique\nA: 12\nB: 19\nC: 8\nD: 15";
const SAMPLE_TABLE = "Colonne A | Colonne B | Colonne C\n | | \n | | ";
const DEFAULT_SIZE = {
  rect: [160, 100], ellipse: [160, 100], diamond: [170, 120], triangle: [150, 130], hexagon: [170, 110], star: [140, 140],
  frame: [420, 300], table: [420, 150], chart: [420, 280],
};
const DRAG_BOX_TYPES = ["rect", "ellipse", "diamond", "triangle", "hexagon", "star", "frame", "table", "chart"];

const rid = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  const [panning, setPanning] = useState(false);
  const [menu, setMenu] = useState(null);                    // groupe d'outils déplié
  const [picks, setPicks] = useState({ pen: "pencil", shape: "rect", conn: "arrow", chart: "bar", emoji: "👍" });
  const [picker, setPicker] = useState(false);
  const [multi, setMulti] = useState([]);                    // sélection multiple (lasso)
  const [penSize, setPenSize] = useState(1);                 // index dans PEN_SIZES / HL_SIZES
  const [modal, setModal] = useState(null);                  // édition d'un tableau / graphique / cadre
  const [, bump] = useState(0);
  const [myName, setMyName] = useState(() => {
    try { return localStorage.getItem("wb_name") || "Invité " + Math.floor(10 + Math.random() * 90); } catch { return "Invité"; }
  });

  useDocumentMeta(name ? `${name} — Tableau blanc` : "Tableau blanc", "Tableau blanc collaboratif en direct.");

  const boxRef = useRef(null);
  const viewRef = useRef(view);
  const elementsRef = useRef(elements);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const picksRef = useRef(picks);
  const selectedRef = useRef(selected);
  const editingRef = useRef(editing);
  const dragRef = useRef(null);
  const pointers = useRef(new Map());
  const spaceRef = useRef(false);
  const lastSend = useRef(0);
  const lastCursor = useRef(0);
  const myNameRef = useRef(myName);
  const fitted = useRef(false);
  const hist = useRef({ undo: [], redo: [] });
  const draftRef = useRef(null);
  const multiRef = useRef([]);
  const penSizeRef = useRef(1);
  viewRef.current = view;
  elementsRef.current = elements;
  toolRef.current = tool;
  colorRef.current = color;
  picksRef.current = picks;
  selectedRef.current = selected;
  editingRef.current = editing;
  myNameRef.current = myName;
  draftRef.current = draft;
  multiRef.current = multi;
  penSizeRef.current = penSize;

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
    const W = box.clientWidth, H = box.clientHeight, pad = 70;
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
    const isLocalDrag = (elId) => dragRef.current && (dragRef.current.id === elId || (dragRef.current.group && dragRef.current.group[elId]));
    const onUpsert = ({ elId, el }) => {
      if (isLocalDrag(elId)) return;
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

  // ─── Opérations de base (sans historique) ────────────────────────────────
  const nextZ = () => Object.values(elementsRef.current).reduce((m, e) => Math.max(m, e.z || 0), 0) + 1;
  const backZ = () => Object.values(elementsRef.current).reduce((m, e) => Math.min(m, e.z || 0), 0) - 1;

  const putElement = useCallback((elId, el, sync = true) => {
    setElements(prev => ({ ...prev, [elId]: el }));
    elementsRef.current = { ...elementsRef.current, [elId]: el };
    if (sync) send(elId, el);
  }, [send]);

  const removeRaw = useCallback((elId) => {
    if (!elementsRef.current[elId]) return;
    setElements(prev => { const n = { ...prev }; delete n[elId]; return n; });
    const n = { ...elementsRef.current }; delete n[elId]; elementsRef.current = n;
    setSelected(s => (s === elId ? null : s));
    socket.emit("whiteboard:delete", { id, elId });
  }, [id]);

  const applyEl = useCallback((elId, el) => { if (el) putElement(elId, el); else removeRaw(elId); }, [putElement, removeRaw]);

  // ─── Historique annuler / rétablir (local à chaque personne) ─────────────
  const record = useCallback((changes) => {
    const ch = changes.filter(c => JSON.stringify(c.before) !== JSON.stringify(c.after));
    if (!ch.length) return;
    hist.current.undo.push(ch);
    if (hist.current.undo.length > 100) hist.current.undo.shift();
    hist.current.redo = [];
    bump(n => n + 1);
  }, []);

  const undo = useCallback(() => {
    const ch = hist.current.undo.pop();
    if (!ch) return;
    [...ch].reverse().forEach(c => applyEl(c.id, c.before));
    hist.current.redo.push(ch);
    bump(n => n + 1);
  }, [applyEl]);

  const redo = useCallback(() => {
    const ch = hist.current.redo.pop();
    if (!ch) return;
    ch.forEach(c => applyEl(c.id, c.after));
    hist.current.undo.push(ch);
    bump(n => n + 1);
  }, [applyEl]);

  // ─── Opérations avec historique ──────────────────────────────────────────
  const createEl = useCallback((el) => {
    const nid = rid();
    putElement(nid, el);
    record([{ id: nid, before: null, after: el }]);
    return nid;
  }, [putElement, record]);

  const removeElement = useCallback((elId) => {
    const el = elementsRef.current[elId];
    if (!el) return;
    record([{ id: elId, before: el, after: null }]);
    removeRaw(elId);
  }, [record, removeRaw]);

  const changeElement = useCallback((elId, patch) => {
    const el = elementsRef.current[elId];
    if (!el) return;
    const next = { ...el, ...patch };
    putElement(elId, next);
    record([{ id: elId, before: el, after: next }]);
  }, [putElement, record]);

  const commitText = useCallback((elId, text) => {
    setEditing(null);
    const el = elementsRef.current[elId];
    if (!el) return;
    if (el.type === "text" && !text.trim()) {
      const last = hist.current.undo[hist.current.undo.length - 1];
      if (last && last.length === 1 && last[0].id === elId && last[0].before === null) hist.current.undo.pop();   // création annulée
      else record([{ id: elId, before: el, after: null }]);
      bump(n => n + 1);
      return removeRaw(elId);
    }
    changeElement(elId, { text });
  }, [changeElement, record, removeRaw]);

  const patchSelected = (patch) => { if (selectedRef.current) changeElement(selectedRef.current, patch); };

  const duplicate = () => {
    const el = elementsRef.current[selectedRef.current];
    if (!el) return;
    const nid = createEl({ ...el, x: el.x + 24, y: el.y + 24, z: el.type === "frame" ? backZ() : nextZ() });
    setSelected(nid);
  };

  const removeMulti = () => {
    const ids = multiRef.current.filter(id => elementsRef.current[id]);
    record(ids.map(id => ({ id, before: elementsRef.current[id], after: null })));
    ids.forEach(id => removeRaw(id));
    setMulti([]);
  };
  const patchMulti = (patch) => {
    const changes = [];
    for (const id of multiRef.current) {
      const el = elementsRef.current[id];
      if (!el || el.type === "emoji") continue;
      const next = { ...el, ...patch };
      putElement(id, next);
      changes.push({ id, before: el, after: next });
    }
    record(changes);
  };
  const duplicateMulti = () => {
    const nids = [], changes = [];
    for (const id of multiRef.current) {
      const el = elementsRef.current[id];
      if (!el) continue;
      const nid = rid();
      const next = { ...el, x: el.x + 24, y: el.y + 24, z: el.type === "frame" ? backZ() : nextZ() };
      putElement(nid, next);
      changes.push({ id: nid, before: null, after: next });
      nids.push(nid);
    }
    record(changes);
    setMulti(nids);
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

  // ─── Modèles ──────────────────────────────────────────────────────────────
  const insertTemplate = (tpl) => {
    const list = tpl.build();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const e of list) {
      const b = bounds(e);
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    const box = boxRef.current;
    const v = viewRef.current;
    const cw = box.clientWidth, ch = box.clientHeight;
    // on adapte le zoom si le modèle déborde de l'écran
    let z = v.z;
    if ((x2 - x1) * z > cw * 0.88 || (y2 - y1) * z > ch * 0.82) z = clamp(Math.min((cw * 0.88) / (x2 - x1), (ch * 0.82) / (y2 - y1)), MIN_Z, 1);
    // Tableau vide : le modèle va au centre de la vue. Sinon il se place à droite
    // du contenu existant pour ne rien recouvrir, et la vue se recentre dessus.
    const existing = Object.values(elementsRef.current);
    let centerX = (cw / 2 - v.x) / v.z, centerY = (ch / 2 - v.y) / v.z, moveView = false;
    if (existing.length) {
      let ex2 = -Infinity, ey1 = Infinity;
      for (const e of existing) { const b = bounds(e); ex2 = Math.max(ex2, b.x + b.w); ey1 = Math.min(ey1, b.y); }
      centerX = ex2 + 140 + (x2 - x1) / 2;
      centerY = ey1 + (y2 - y1) / 2;
      moveView = true;
    }
    const ox = centerX - (x1 + x2) / 2, oy = centerY - (y1 + y2) / 2;
    const zTop = nextZ(), zBack = backZ();
    let a = 0, b2 = 0;
    const changes = [];
    for (const e of list) {
      const nid = rid();
      const el = { ...e, x: Math.round(e.x + ox), y: Math.round(e.y + oy), z: e.type === "frame" ? zBack - (list.length - b2++) : zTop + a++ };
      if (!el.author && el.type === "sticky") el.author = myNameRef.current;
      putElement(nid, el);
      changes.push({ id: nid, before: null, after: el });
    }
    record(changes);
    if (moveView || z !== v.z) setView({ z, x: cw / 2 - centerX * z, y: ch / 2 - centerY * z });
    setPicker(false);
    setTool("select");
  };

  // ─── Clavier ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e) => {
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT")) return;
      if (e.code === "Space") { spaceRef.current = true; e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && multiRef.current.length) {
        e.preventDefault(); removeMulti(); return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) {
        e.preventDefault(); removeElement(selectedRef.current); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { setSelected(null); setMulti([]); setTool("select"); setMenu(null); setPicker(false); setModal(null); return; }
      const k = KEYS[e.key.toLowerCase()];
      if (k) { setTool(k); setMenu(null); }
    };
    const up = (e) => { if (e.code === "Space") spaceRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [removeElement, undo, redo]); // eslint-disable-line

  // ─── Pointeur ─────────────────────────────────────────────────────────────
  const baseBox = (type, x, y, w, h) => {
    const p = picksRef.current;
    const el = { type, x, y, w, h, text: "", color: colorRef.current, fs: 16, z: type === "frame" ? backZ() : nextZ() };
    if (type === "frame") el.text = "Cadre";
    if (type === "table") { el.text = SAMPLE_TABLE; el.fs = 15; }
    if (type === "chart") { el.text = SAMPLE_CHART; el.kind = p.chart; el.fs = 14; }
    return el;
  };

  // Gomme : un geste = une seule entrée d'historique
  const eraseAt = (d, hit) => {
    if (!hit) return;
    const id = hit.getAttribute("data-el");
    const el = elementsRef.current[id];
    if (!el || (d.ink && el.type !== "pencil")) return;
    d.batch.push({ id, before: el, after: null });
    removeRaw(id);
  };

  const onPointerDown = (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.closest("[data-ui]")) return;
    setMenu(null);
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
      setPanning(true);
      return;
    }

    if (tl === "select") {
      if (hitHandle && selectedRef.current) {
        const el = elementsRef.current[selectedRef.current];
        dragRef.current = { mode: "resize", id: selectedRef.current, wx: w.x, wy: w.y, ow: el.w, oh: el.h, before: { ...el } };
        return;
      }
      if (hitEl && multiRef.current.includes(hitEl.getAttribute("data-el"))) {   // déplacement du groupe sélectionné au lasso
        const group = {};
        for (const mid of multiRef.current) if (elementsRef.current[mid]) group[mid] = { ...elementsRef.current[mid] };
        dragRef.current = { mode: "move", id: hitEl.getAttribute("data-el"), wx: w.x, wy: w.y, group, moved: false };
        return;
      }
      if (multiRef.current.length) setMulti([]);
      if (hitEl) {
        const elId = hitEl.getAttribute("data-el");
        const el = elementsRef.current[elId];
        if (!el) return;
        setSelected(elId);
        const group = { [elId]: { ...el } };
        if (el.type === "frame") {          // déplacer un cadre emporte ce qu'il contient
          for (const [cid, c] of Object.entries(elementsRef.current)) {
            if (cid === elId || c.type === "frame") continue;
            const b = bounds(c);
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            if (cx >= el.x && cx <= el.x + el.w && cy >= el.y && cy <= el.y + el.h) group[cid] = { ...c };
          }
        }
        dragRef.current = { mode: "move", id: elId, wx: w.x, wy: w.y, group, moved: false };
        return;
      }
      setSelected(null);
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, view: { ...viewRef.current } };
      setPanning(true);
      return;
    }

    if (tl === "eraser" || tl === "eraserInk") {
      dragRef.current = { mode: "erase", ink: tl === "eraserInk", batch: [] };
      eraseAt(dragRef.current, hitEl);
      return;
    }

    if (tl === "lasso") {
      if (multiRef.current.length) setMulti([]);
      setSelected(null);
      dragRef.current = { mode: "lasso" };
      setDraft({ type: "lasso", pts: [w.x, w.y] });
      return;
    }

    if (tl === "sticky" || tl === "text") {
      const el = tl === "sticky"
        ? { type: "sticky", x: w.x - 90, y: w.y - 80, w: 180, h: 160, text: "", color: colorRef.current, fs: 18, z: nextZ(), author: myNameRef.current }
        : { type: "text", x: w.x, y: w.y - 14, w: 240, h: 60, text: "", color: colorRef.current === "#fee440" ? "#ffffff" : colorRef.current, fs: 22, z: nextZ() };
      const nid = createEl(el);
      setSelected(nid); setEditing(nid); setTool("select");
      return;
    }

    if (tl === "emoji") {
      const size = 56;
      const nid = createEl({ type: "emoji", x: w.x - size * 0.6, y: w.y - size * 0.6, w: size * 1.2, h: size * 1.2, text: picksRef.current.emoji, color: "#ffffff", fs: size, z: nextZ() });
      setSelected(nid); setTool("select");
      return;
    }

    if (DRAG_BOX_TYPES.includes(tl)) {
      dragRef.current = { mode: "draw", type: tl, sx: w.x, sy: w.y };
      setDraft(baseBox(tl, w.x, w.y, 1, 1));
      return;
    }

    if (tl === "arrow" || tl === "line") {
      dragRef.current = { mode: "draw", type: tl, sx: w.x, sy: w.y };
      setDraft({ type: tl, x: w.x, y: w.y, points: [0, 0, 0, 0], size: 3, color: colorRef.current, z: 0 });
      return;
    }

    if (tl === "pencil" || tl === "highlighter") {
      const hl = tl === "highlighter";
      dragRef.current = { mode: "pencil", sx: w.x, sy: w.y };
      setDraft({ type: "pencil", x: w.x, y: w.y, points: [0, 0], size: (hl ? HL_SIZES : PEN_SIZES)[penSizeRef.current], color: colorRef.current, z: 0, ...(hl ? { hl: true } : {}) });
    }
  };

  const throttled = () => {
    const t = Date.now();
    if (t - lastSend.current > 50) { lastSend.current = t; return true; }
    return false;
  };

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = dragRef.current;

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
      eraseAt(d, document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-el]"));
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (d.mode === "lasso") {
      setDraft(dr => {
        if (!dr || dr.type !== "lasso") return dr;
        const p = dr.pts;
        if (Math.hypot(w.x - p[p.length - 2], w.y - p[p.length - 1]) < 3 / viewRef.current.z) return dr;
        return { ...dr, pts: [...p, w.x, w.y] };
      });
      return;
    }
    if (d.mode === "move") {
      const dx = w.x - d.wx, dy = w.y - d.wy;
      if (!d.moved && Math.hypot(dx, dy) < 2 / viewRef.current.z) return;
      d.moved = true;
      const sync = throttled();
      for (const [cid, orig] of Object.entries(d.group)) putElement(cid, { ...orig, x: orig.x + dx, y: orig.y + dy }, sync);
      return;
    }
    if (d.mode === "resize") {
      const el = elementsRef.current[d.id];
      if (!el) return;
      let next;
      if (el.type === "emoji") {
        const size = Math.max(28, d.ow + (w.x - d.wx));
        next = { ...el, w: size, h: size, fs: Math.round(size / 1.2) };
      } else {
        next = { ...el, w: Math.max(40, d.ow + (w.x - d.wx)), h: Math.max(30, d.oh + (w.y - d.wy)) };
      }
      putElement(d.id, next, throttled());
      return;
    }
    if (d.mode === "draw") {
      if (d.type === "arrow" || d.type === "line") setDraft(dr => dr && ({ ...dr, points: [0, 0, w.x - d.sx, w.y - d.sy] }));
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
    setPanning(false);
    pointers.current.delete(e.pointerId);
    const d = dragRef.current;
    if (d && d.mode === "pinch") {
      if (pointers.current.size < 2) dragRef.current = null;
      return;
    }
    dragRef.current = null;
    if (!d) return;

    if (d.mode === "erase") { if (d.batch.length) record(d.batch); return; }
    if (d.mode === "lasso") {
      const dr = draftRef.current;
      setDraft(null);
      if (!dr || dr.type !== "lasso" || dr.pts.length < 6) return;
      const ids = [];
      for (const [id, el] of Object.entries(elementsRef.current)) {
        const b = bounds(el);
        if (pointInPoly(b.x + b.w / 2, b.y + b.h / 2, dr.pts)) ids.push(id);
      }
      setMulti(ids);
      if (ids.length) setTool("select");
      return;
    }
    if (d.mode === "move") {
      if (!d.moved) return;
      const changes = [];
      for (const [cid, orig] of Object.entries(d.group)) {
        const cur = elementsRef.current[cid];
        if (cur) { send(cid, cur); changes.push({ id: cid, before: orig, after: cur }); }
      }
      record(changes);
      return;
    }
    if (d.mode === "resize") {
      const el = elementsRef.current[d.id];
      if (el) { send(d.id, el); record([{ id: d.id, before: d.before, after: el }]); }
      return;
    }
    if (d.mode === "draw") {
      const dr = draftRef.current;
      setDraft(null);
      if (!dr) return;
      if (dr.type === "arrow" || dr.type === "line") {
        if (Math.hypot(dr.points[2], dr.points[3]) < 12) return;
        const nid = createEl({ ...dr, z: nextZ() });
        setSelected(nid); setTool("select");
        return;
      }
      const small = dr.w < 8 && dr.h < 8;
      const [dw, dh] = DEFAULT_SIZE[dr.type] || [160, 100];
      const nid = createEl({ ...dr, w: small ? dw : Math.max(30, dr.w), h: small ? dh : Math.max(30, dr.h), z: dr.type === "frame" ? backZ() : nextZ() });
      setSelected(nid); setTool("select");
      if (dr.type === "table" || dr.type === "chart" || dr.type === "frame") openModal(nid);
      else if (TEXT_BOX_TYPES.includes(dr.type)) setEditing(nid);
      return;
    }
    if (d.mode === "pencil") {
      const dr = draftRef.current;
      setDraft(null);
      if (!dr) return;
      const pts = dr.points.length < 4 ? [...dr.points, 0.5, 0.5] : dr.points;
      createEl({ ...dr, points: pts, z: nextZ() });
    }
  };

  const onDoubleClick = (e) => {
    if (toolRef.current !== "select") return;
    // la capture du pointeur redirige l'événement vers le conteneur : on retrouve l'élément par position
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-el]");
    if (!hit) return;
    const elId = hit.getAttribute("data-el");
    const el = elementsRef.current[elId];
    if (!el) return;
    setSelected(elId);
    if (el.type === "table" || el.type === "chart" || el.type === "frame") openModal(elId);
    else if (TEXT_BOX_TYPES.includes(el.type)) setEditing(elId);
  };

  // ─── Édition des tableaux / graphiques / cadres ──────────────────────────
  const openModal = (elId) => {
    const el = elementsRef.current[elId];
    if (!el) return;
    setModal({ id: elId, type: el.type, text: el.text || "", kind: el.kind || "bar" });
  };
  const saveModal = () => {
    if (!modal) return;
    const el = elementsRef.current[modal.id];
    if (el) {
      const patch = { text: modal.text };
      if (el.type === "chart") patch.kind = modal.kind;
      changeElement(modal.id, patch);
    }
    setModal(null);
  };

  const chooseTool = (t, group, value) => {
    setTool(t);
    setMenu(null);
    if (group) setPicks(p => ({ ...p, [group]: value }));
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
    hist.current = { undo: [], redo: [] }; bump(n => n + 1);
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
  const canUndo = hist.current.undo.length > 0, canRedo = hist.current.redo.length > 0;
  const btn = (active, disabled) => ({
    width: 38, height: 38, borderRadius: 9, border: "1px solid " + (active ? ACCENT : "#2a2a44"),
    background: active ? ACCENT + "33" : "#14142a", color: disabled ? "#555" : "#fff", fontSize: 17, cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0, opacity: disabled ? 0.5 : 1,
  });
  const small = (extra = {}) => ({ ...btn(false), width: 30, height: 30, fontSize: 14, ...extra });
  const cursorStyle = tool === "select" ? "default" : tool === "hand" ? "grab" : (tool === "eraser" || tool === "eraserInk") ? "cell" : "crosshair";
  const gridSize = 28 * view.z;
  const isShape = SHAPES.some(s => s.id === tool), isConn = CONNECTORS.some(s => s.id === tool);
  const shapeIcon = SHAPES.find(s => s.id === picks.shape)?.icon, connIcon = CONNECTORS.find(s => s.id === picks.conn)?.icon;
  const chartIcon = CHARTS.find(s => s.id === picks.chart)?.icon;
  const hasSizeText = selEl && (TEXT_BOX_TYPES.includes(selEl.type) || selEl.type === "table" || selEl.type === "frame");
  const flyoutStyle = { position: "absolute", left: 62, display: "flex", flexWrap: "wrap", gap: 6, padding: 8, background: "#14142af2", border: "1px solid #2a2a44", borderRadius: 12, zIndex: 20 };

  const groupBtn = (key, icon, label, active) => (
    <button title={label} onClick={() => setMenu(m => (m === key ? null : key))} style={{ ...btn(active || menu === key), position: "relative" }}>
      {icon}
      <span style={{ position: "absolute", right: 3, bottom: 1, fontSize: 8, color: "#888" }}>◢</span>
    </button>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0d0d1a", color: "#fff", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none" }}>

      <header data-ui style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #1c1c30", background: "#101022" }}>
        <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🧑‍🎨 {name || "Tableau blanc"}</h1>
        <button onClick={() => setPicker(true)}
          style={{ padding: "7px 13px", background: ACCENT, border: "none", borderRadius: 8, color: "#0d0d1a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          📋 Modèles
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={rename} title="Changer ton nom affiché"
            style={{ padding: "6px 10px", background: "#14142a", border: "1px solid #2a2a44", borderRadius: 8, color: "#aaa", fontSize: 12.5, cursor: "pointer" }}>
            👤 {myName}
          </button>
          <button onClick={() => zoomAt(1 / 1.25, boxRef.current.clientWidth / 2, boxRef.current.clientHeight / 2)} style={small()}>−</button>
          <span style={{ fontSize: 12.5, color: "#888", width: 42, textAlign: "center" }}>{Math.round(view.z * 100)}%</span>
          <button onClick={() => zoomAt(1.25, boxRef.current.clientWidth / 2, boxRef.current.clientHeight / 2)} style={small()}>+</button>
          <button onClick={() => fit()} title="Tout voir" style={small()}>⤢</button>
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
        onSelectStart={e => e.preventDefault()}
        onDragStart={e => e.preventDefault()}
        style={{
          flex: 1, position: "relative", overflow: "hidden", touchAction: "none", cursor: panning ? "grabbing" : cursorStyle,
          backgroundColor: "#0d0d1a",
          backgroundImage: "radial-gradient(#2a2a44 1.2px, transparent 1.2px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, pointerEvents: panning ? "none" : "auto" }}>
          {sorted.map(([elId, el]) => (
            <ElementView key={elId} id={elId} el={el} editing={editing === elId} onCommit={commitText} />
          ))}
          {draft && draft.type === "lasso" && (
            <svg width="1" height="1" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
              <polygon points={draft.pts.join(" ").replace(/(\S+) (\S+)/g, "$1,$2")} fill={ACCENT + "22"} stroke={ACCENT} strokeWidth={1.5 / view.z} strokeDasharray={`${6 / view.z} ${4 / view.z}`} />
            </svg>
          )}
          {draft && draft.type !== "lasso" && <ElementView id="__draft" el={draft} editing={false} onCommit={() => {}} />}
          {multi.map(id => {
            const el = elements[id];
            if (!el) return null;
            const b = bounds(el);
            return <div key={"m" + id} style={{ position: "absolute", left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6, border: `${1.5 / view.z}px solid ${ACCENT}`, background: ACCENT + "14", pointerEvents: "none", boxSizing: "border-box", borderRadius: 4 }} />;
          })}

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

        {/* Barre d'outils verticale */}
        <div data-ui style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", maxHeight: "calc(100% - 20px)", overflowY: "auto", overflowX: "visible",
          display: "flex", flexDirection: "column", gap: 5, padding: 7, background: "#14142aee", border: "1px solid #2a2a44", borderRadius: 14, zIndex: 10,
        }}>
          <button title="Sélection (V)" onClick={() => chooseTool("select")} style={btn(tool === "select")}>↖</button>
          <button title="Déplacer la vue (H ou Espace)" onClick={() => chooseTool("hand")} style={btn(tool === "hand")}>✋</button>
          <button title="Post-it (S)" onClick={() => chooseTool("sticky")} style={btn(tool === "sticky")}>🗒️</button>
          <button title="Texte (T)" onClick={() => chooseTool("text")} style={btn(tool === "text")}>T</button>
          {groupBtn("shapes", shapeIcon, "Formes", isShape)}
          {groupBtn("conn", connIcon, "Connecteurs", isConn)}
          {groupBtn("pen", picks.pen === "highlighter" ? "🖍️" : picks.pen === "lasso" ? "⭕" : picks.pen === "eraserInk" ? "🩹" : "✏️", "Crayon, surligneur, lasso…", PEN_TOOLS.includes(tool))}
          <button title="Cadre (F) — regroupe et déplace ce qu'il contient" onClick={() => chooseTool("frame")} style={btn(tool === "frame")}>⬚</button>
          <button title="Tableau (B)" onClick={() => chooseTool("table")} style={btn(tool === "table")}>▦</button>
          {groupBtn("charts", chartIcon, "Graphiques", tool === "chart")}
          {groupBtn("emoji", picks.emoji, "Émojis et tampons", tool === "emoji")}
          <button title="Gomme (E)" onClick={() => chooseTool("eraser")} style={btn(tool === "eraser")}>🧽</button>
          <div style={{ height: 1, background: "#2a2a44", margin: "2px 0" }} />
          <button title="Annuler (Ctrl+Z)" disabled={!canUndo} onClick={undo} style={btn(false, !canUndo)}>↶</button>
          <button title="Rétablir (Ctrl+Maj+Z)" disabled={!canRedo} onClick={redo} style={btn(false, !canRedo)}>↷</button>
        </div>

        {/* Menus déroulants des groupes d'outils */}
        {menu === "shapes" && (
          <div data-ui style={{ ...flyoutStyle, top: "30%", width: 140 }}>
            {SHAPES.map(s => <button key={s.id} title={s.label} onClick={() => chooseTool(s.id, "shape", s.id)} style={btn(tool === s.id)}>{s.icon}</button>)}
          </div>
        )}
        {menu === "pen" && (
          <div data-ui style={{ ...flyoutStyle, top: "34%", width: 150 }}>
            <button title="Crayon (P)" onClick={() => chooseTool("pencil", "pen", "pencil")} style={btn(tool === "pencil")}>✏️</button>
            <button title="Surligneur (I)" onClick={() => chooseTool("highlighter", "pen", "highlighter")} style={btn(tool === "highlighter")}>🖍️</button>
            <button title="Gomme de traits (E) — efface l'élément touché" onClick={() => chooseTool("eraser", "pen", "eraser")} style={btn(tool === "eraser")}>🧽</button>
            <button title="Gomme de dessin (X) — n'efface que les traits au crayon / surligneur" onClick={() => chooseTool("eraserInk", "pen", "eraserInk")} style={btn(tool === "eraserInk")}>🩹</button>
            <button title="Lasso (Q) — entoure pour sélectionner plusieurs éléments" onClick={() => chooseTool("lasso", "pen", "lasso")} style={btn(tool === "lasso")}>⭕</button>
            <div style={{ width: "100%", height: 1, background: "#2a2a44" }} />
            {[0, 1, 2].map(i => (
              <button key={i} title={["Fin", "Moyen", "Épais"][i]} onClick={() => setPenSize(i)} style={btn(penSize === i)}>
                <span style={{ width: 6 + i * 6, height: 6 + i * 6, borderRadius: "50%", background: "#fff", display: "block" }} />
              </button>
            ))}
          </div>
        )}
        {menu === "conn" && (
          <div data-ui style={{ ...flyoutStyle, top: "36%" }}>
            {CONNECTORS.map(s => <button key={s.id} title={s.label} onClick={() => chooseTool(s.id, "conn", s.id)} style={btn(tool === s.id)}>{s.icon}</button>)}
          </div>
        )}
        {menu === "charts" && (
          <div data-ui style={{ ...flyoutStyle, top: "46%", width: 140 }}>
            {CHARTS.map(s => <button key={s.id} title={s.label} onClick={() => chooseTool("chart", "chart", s.id)} style={btn(tool === "chart" && picks.chart === s.id)}>{s.icon}</button>)}
          </div>
        )}
        {menu === "emoji" && (
          <div data-ui style={{ ...flyoutStyle, top: "40%", width: 250 }}>
            {EMOJIS.map(em => <button key={em} onClick={() => chooseTool("emoji", "emoji", em)} style={{ ...btn(tool === "emoji" && picks.emoji === em), width: 34, height: 34, fontSize: 18 }}>{em}</button>)}
          </div>
        )}

        {/* Barre contextuelle : couleurs et options de l'élément sélectionné */}
        <div data-ui style={{
          position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", maxWidth: "calc(100% - 100px)",
          display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", overflowX: "auto",
          background: "#14142aee", border: "1px solid #2a2a44", borderRadius: 14, zIndex: 10,
        }}>
          {COLORS.map(c => {
            const current = (selEl && selEl.color) || color;
            return (
              <button key={c} title={c}
                onClick={() => { setColor(c); if (multiRef.current.length) patchMulti({ color: c }); else if (selEl && selEl.type !== "emoji") patchSelected({ color: c }); }}
                style={{
                  width: 24, height: 24, borderRadius: "50%", background: c, flexShrink: 0, cursor: "pointer", padding: 0,
                  border: current.toLowerCase() === c ? "3px solid #fff" : "2px solid #555",
                  boxShadow: current.toLowerCase() === c ? "0 0 0 1px " + ACCENT : "none",
                }} />
            );
          })}
          {multi.length > 0 && (
            <>
              <div style={{ width: 1, height: 26, background: "#2a2a44", margin: "0 4px", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#aaa", whiteSpace: "nowrap" }}>{multi.length} élément{multi.length > 1 ? "s" : ""}</span>
              <button style={small()} title="Dupliquer" onClick={duplicateMulti}>⧉</button>
              <button style={small()} title="Supprimer (Suppr)" onClick={removeMulti}>🗑</button>
            </>
          )}
          {selEl && <div style={{ width: 1, height: 26, background: "#2a2a44", margin: "0 4px", flexShrink: 0 }} />}
          {hasSizeText && (
            <>
              <button style={small({ fontSize: 12 })} title="Texte plus petit" onClick={() => patchSelected({ fs: clamp(Math.round(selEl.fs * 0.85), 8, 120) })}>A−</button>
              <button style={small()} title="Texte plus grand" onClick={() => patchSelected({ fs: clamp(Math.round(selEl.fs * 1.18), 8, 120) })}>A+</button>
            </>
          )}
          {selEl && LINE_TYPES.includes(selEl.type) && (
            <>
              <button style={small({ fontSize: 12 })} title="Trait plus fin" onClick={() => patchSelected({ size: clamp(selEl.size - 1, 1, 24) })}>━</button>
              <button style={small({ fontSize: 16 })} title="Trait plus épais" onClick={() => patchSelected({ size: clamp(selEl.size + 2, 1, 24) })}>▬</button>
            </>
          )}
          {selEl && selEl.type === "chart" && CHARTS.map(c => (
            <button key={c.id} style={small({ ...(selEl.kind === c.id ? { border: "1px solid " + ACCENT, background: ACCENT + "33" } : {}) })} title={c.label} onClick={() => patchSelected({ kind: c.id })}>{c.icon}</button>
          ))}
          {selEl && (selEl.type === "chart" || selEl.type === "table" || selEl.type === "frame") && (
            <button style={small()} title="Modifier le contenu (double-clic)" onClick={() => openModal(selected)}>✎</button>
          )}
          {selEl && (
            <>
              <button style={small()} title="Premier plan" onClick={() => patchSelected({ z: nextZ() })}>⬆</button>
              <button style={small()} title="Arrière-plan" onClick={() => patchSelected({ z: backZ() })}>⬇</button>
              <button style={small()} title="Dupliquer (Ctrl+D)" onClick={duplicate}>⧉</button>
              <button style={small()} title="Supprimer (Suppr)" onClick={() => removeElement(selected)}>🗑</button>
            </>
          )}
        </div>

        {Object.keys(elements).length === 0 && !draft && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "34%", textAlign: "center", color: "#555", pointerEvents: "none", padding: "0 20px" }}>
            <div style={{ fontSize: 40 }}>🗒️</div>
            <div style={{ fontSize: 15, marginTop: 6 }}>Tableau vide — pose un post-it avec la barre à gauche, ou pars d'un modèle avec « 📋 Modèles ».</div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>Molette = zoom · Espace + glisser = déplacer la vue · double-clic = éditer</div>
          </div>
        )}
      </div>

      {picker && <TemplatePicker onPick={insertTemplate} onClose={() => setPicker(false)} />}

      {modal && (
        <div data-ui onPointerDown={e => e.stopPropagation()} onClick={() => setModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(5,5,15,.75)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, background: "#111", border: "1px solid #2a2a44", borderRadius: 16, padding: "22px 22px 18px", color: "#fff" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>
              {modal.type === "chart" ? "📊 Données du graphique" : modal.type === "table" ? "▦ Contenu du tableau" : "⬚ Titre du cadre"}
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#888", lineHeight: 1.5 }}>
              {modal.type === "chart" && <>Une ligne par donnée : <code>Libellé: valeur</code>. Une ligne commençant par <code>#</code> sert de titre.</>}
              {modal.type === "table" && <>Une ligne par rangée, cellules séparées par <code>|</code>. La première ligne sert d'en-tête.</>}
              {modal.type === "frame" && <>Le cadre emporte avec lui ce qu'il contient quand on le déplace par son titre.</>}
            </p>
            {modal.type === "chart" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {CHARTS.map(c => (
                  <button key={c.id} onClick={() => setModal(m => ({ ...m, kind: c.id }))}
                    style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                      background: modal.kind === c.id ? ACCENT + "33" : "#1a1a2e", border: `1px solid ${modal.kind === c.id ? ACCENT : "#333"}`, color: modal.kind === c.id ? ACCENT : "#aaa" }}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            )}
            {modal.type === "frame" ? (
              <input autoFocus value={modal.text} maxLength={60} onChange={e => setModal(m => ({ ...m, text: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") saveModal(); e.stopPropagation(); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 9, color: "#fff", fontSize: 15, outline: "none", userSelect: "text" }} />
            ) : (
              <textarea autoFocus value={modal.text} rows={9} onChange={e => setModal(m => ({ ...m, text: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveModal(); e.stopPropagation(); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 13px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 9, color: "#fff", fontSize: 14, outline: "none", fontFamily: "monospace", resize: "vertical", userSelect: "text" }} />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(null)} style={{ padding: "9px 16px", background: "#1a1a2e", border: "1px solid #333", borderRadius: 9, color: "#aaa", cursor: "pointer", fontSize: 14 }}>Annuler</button>
              <button onClick={saveModal} style={{ padding: "9px 18px", background: ACCENT, border: "none", borderRadius: 9, color: "#0d0d1a", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
