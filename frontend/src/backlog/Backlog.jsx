import { useEffect, useState, useCallback } from "react";
import { authApi, getToken, clearToken } from "../auth";
import { itemsApi } from "../itemsApi";

// Pont entre les outils « par lien » (poker, rétros, tableau blanc) et le backlog de l'équipe
// (espace connecté). Rien n'est envoyé sans que la personne soit connectée et choisisse l'équipe.

const ACCENT = "#00f5d4";
const ORG_KEY = "bk_org";
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignoré */ } };

export function useBacklogOrg() {
  const [status, setStatus] = useState(getToken() ? "loading" : "out");
  const [orgs, setOrgs] = useState([]);
  const [slug, setSlugState] = useState(lsGet(ORG_KEY) || "");
  useEffect(() => {
    if (!getToken()) { setStatus("out"); return; }
    authApi.me()
      .then(me => {
        setOrgs(me.orgs || []);
        setSlugState(cur => (me.orgs || []).some(o => o.slug === cur) ? cur : (me.orgs?.[0]?.slug || ""));
        setStatus(me.orgs?.length ? "ok" : "noorg");
      })
      .catch(() => { clearToken(); setStatus("out"); });
  }, []);
  const setSlug = (s) => { setSlugState(s); lsSet(ORG_KEY, s); };
  return { status, orgs, slug, setSlug };
}

const overlay = { position: "fixed", inset: 0, background: "rgba(5,5,15,.78)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const card = { width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", background: "#111", border: "1px solid #2a2a44", borderRadius: 16, padding: "20px 22px", color: "#fff", fontFamily: "system-ui, sans-serif" };
const input = { background: "#0d0d1a", border: "1px solid #2a2a44", borderRadius: 8, color: "#fff", padding: "8px 10px", fontSize: 14, outline: "none", boxSizing: "border-box" };
const btnPrimary = { background: ACCENT, color: "#0d0d1a", border: "none", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const btnGhost = { background: "#14142a", color: "#bbb", border: "1px solid #2a2a44", borderRadius: 9, padding: "9px 14px", fontSize: 13, cursor: "pointer" };

function Gate({ bk, onClose, children }) {
  if (bk.status === "loading") return <p style={{ color: "#888" }}>Chargement…</p>;
  if (bk.status === "out") {
    return (
      <div>
        <p style={{ color: "#bbb", lineHeight: 1.6 }}>Pour utiliser le backlog de ton équipe, connecte-toi à ton espace de travail.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} style={{ ...btnPrimary, textDecoration: "none" }}>Se connecter</a>
          <a href="/register" style={{ ...btnGhost, textDecoration: "none" }}>Créer un espace</a>
          <button onClick={onClose} style={btnGhost}>Fermer</button>
        </div>
      </div>
    );
  }
  if (bk.status === "noorg") return <p style={{ color: "#bbb" }}>Tu n'as pas encore d'équipe. Crée-en une depuis <a href="/app" style={{ color: ACCENT }}>l'espace de travail</a>.</p>;
  return children;
}

function OrgSelect({ bk }) {
  if (bk.orgs.length < 2) return bk.orgs[0] ? <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Équipe : <strong style={{ color: "#ddd" }}>{bk.orgs[0].name}</strong></div> : null;
  return (
    <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 12 }}>Équipe :{" "}
      <select value={bk.slug} onChange={e => bk.setSlug(e.target.value)} style={{ ...input, padding: "6px 8px" }}>
        {bk.orgs.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
      </select>
    </label>
  );
}

// ─── Envoyer des éléments vers le backlog ───────────────────────────────────
// drafts : [{ title, description?, storyPoints? }] ; kind : "task" | "retro_action"
// mode "estimates" : met à jour les points d'un item existant du même titre au lieu d'en créer un.
export function SendToBacklog({ drafts, source, sourceRef, kind = "task", mode = "create", heading, onClose }) {
  const bk = useBacklogOrg();
  const [rows, setRows] = useState(() => drafts.map(d => ({ ...d, on: true })));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  const send = async () => {
    setBusy(true); setError("");
    try {
      let existing = [];
      if (mode === "estimates") existing = await itemsApi.listItems(bk.slug);
      let created = 0, updated = 0;
      for (const r of rows.filter(x => x.on && x.title.trim())) {
        const match = mode === "estimates" && existing.find(i => i.kind === "task" && i.title.trim().toLowerCase() === r.title.trim().toLowerCase());
        if (match) {
          if (r.storyPoints != null) { await itemsApi.updateItem(bk.slug, match.id, { storyPoints: r.storyPoints }); updated++; }
        } else {
          await itemsApi.createItem(bk.slug, { title: r.title.trim(), description: r.description || "", storyPoints: r.storyPoints ?? null, kind, source, sourceRef });
          created++;
        }
      }
      setDone({ created, updated });
    } catch (e) { setError(e.message || "Envoi impossible."); }
    setBusy(false);
  };

  return (
    <div data-ui style={overlay} onPointerDown={e => e.stopPropagation()} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>{heading || (kind === "retro_action" ? "✅ Créer des actions dans le backlog" : "📤 Envoyer vers le backlog")}</h2>
        <Gate bk={bk} onClose={onClose}>
          {done ? (
            <div>
              <p style={{ color: ACCENT, fontWeight: 600 }}>
                ✓ {done.created > 0 && `${done.created} créé${done.created > 1 ? "s" : ""}`}{done.created > 0 && done.updated > 0 && " · "}{done.updated > 0 && `${done.updated} estimation${done.updated > 1 ? "s" : ""} mise${done.updated > 1 ? "s" : ""} à jour`}
                {done.created + done.updated === 0 && "Rien à envoyer."}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/app/${bk.slug}`} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>Ouvrir le backlog</a>
                <button onClick={onClose} style={btnGhost}>Fermer</button>
              </div>
            </div>
          ) : (
            <>
              <OrgSelect bk={bk} />
              {rows.length === 0 && <p style={{ color: "#888" }}>Rien à envoyer.</p>}
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input type="checkbox" checked={r.on} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} />
                  <input value={r.title} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} style={{ ...input, flex: 1, minWidth: 0 }} />
                  {mode === "estimates" || r.storyPoints != null ? (
                    <input type="number" min="0" placeholder="pts" value={r.storyPoints ?? ""} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, storyPoints: e.target.value === "" ? null : Number(e.target.value) } : x))} style={{ ...input, width: 64 }} />
                  ) : null}
                </div>
              ))}
              {mode === "estimates" && <p style={{ fontSize: 12.5, color: "#777", margin: "4px 0 12px" }}>Si une tâche du backlog porte le même titre, ses points sont mis à jour ; sinon elle est créée.</p>}
              {error && <p style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={send} disabled={busy || !rows.some(r => r.on && r.title.trim())} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "Envoi…" : "Envoyer"}</button>
                <button onClick={onClose} style={btnGhost}>Annuler</button>
              </div>
            </>
          )}
        </Gate>
      </div>
    </div>
  );
}

// ─── Importer depuis le backlog (poker) ─────────────────────────────────────
export function ImportFromBacklog({ onPick, onClose }) {
  const bk = useBacklogOrg();
  const [items, setItems] = useState(null);
  const [sel, setSel] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (bk.status !== "ok" || !bk.slug) return;
    setItems(null);
    itemsApi.listItems(bk.slug).then(list => setItems(list.filter(i => i.kind === "task" && i.story_points == null && i.status !== "done")))
      .catch(e => setError(e.message));
  }, [bk.status, bk.slug]);
  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>📥 Importer depuis le backlog</h2>
        <Gate bk={bk} onClose={onClose}>
          <OrgSelect bk={bk} />
          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
          {items === null && !error && <p style={{ color: "#888" }}>Chargement…</p>}
          {items && items.length === 0 && <p style={{ color: "#888" }}>Aucune tâche à estimer : tout le backlog a déjà des points.</p>}
          {items && items.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: "#777", margin: "0 0 8px" }}>Tâches sans estimation :</p>
              {items.map(i => (
                <label key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 7, fontSize: 14, color: "#ddd", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!sel[i.id]} onChange={e => setSel(s => ({ ...s, [i.id]: e.target.checked }))} />
                  {i.title}
                </label>
              ))}
              <button style={{ ...btnPrimary, marginTop: 10 }} disabled={!items.some(i => sel[i.id])}
                onClick={() => { onPick(items.filter(i => sel[i.id]).map(i => i.title)); onClose(); }}>Ajouter au poker</button>
            </>
          )}
        </Gate>
        <button onClick={onClose} style={{ ...btnGhost, marginTop: 12 }}>Fermer</button>
      </div>
    </div>
  );
}

// ─── Actions de rétro persistantes (panneau latéral) ────────────────────────
// Liste les actions ouvertes de TOUTES les rétros de l'équipe : ce qui n'est pas fait d'une rétro à l'autre reste visible.
export function RetroActionsPanel({ source, sourceRef, seeds = [], onClose }) {
  const bk = useBacklogOrg();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    if (bk.status !== "ok" || !bk.slug) return;
    itemsApi.listItems(bk.slug, null, { kind: "retro_action" }).then(setItems).catch(e => setError(e.message));
  }, [bk.status, bk.slug]);
  useEffect(load, [load]);

  const add = async (t = title, a = assignee, d = due) => {
    if (!t.trim()) return;
    try {
      await itemsApi.createItem(bk.slug, { title: t.trim(), assignee: a || null, dueDate: d || null, kind: "retro_action", source, sourceRef });
      setTitle(""); setAssignee(""); setDue(""); load();
    } catch (e) { setError(e.message); }
  };
  const toggle = async (i) => { try { await itemsApi.updateItem(bk.slug, i.id, { status: i.status === "done" ? "todo" : "done" }); load(); } catch (e) { setError(e.message); } };
  const del = async (i) => { try { await itemsApi.deleteItem(bk.slug, i.id); load(); } catch (e) { setError(e.message); } };

  const open = (items || []).filter(i => i.status !== "done");
  const closed = (items || []).filter(i => i.status === "done");
  const today = new Date().toISOString().slice(0, 10);
  const existingTitles = new Set((items || []).map(i => i.title.trim().toLowerCase()));

  return (
    <div data-ui onPointerDown={e => e.stopPropagation()} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", background: "#111", borderLeft: "1px solid #2a2a44", zIndex: 80, padding: "18px 18px 24px", overflowY: "auto", color: "#fff", fontFamily: "system-ui, sans-serif", boxShadow: "-10px 0 30px rgba(0,0,0,.5)" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>✅ Actions de rétro</h2>
        <button onClick={onClose} style={btnGhost}>✕</button>
      </div>
      <Gate bk={bk} onClose={onClose}>
        <OrgSelect bk={bk} />
        {error && <p style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <input placeholder="Nouvelle action…" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={input} />
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="Responsable" value={assignee} onChange={e => setAssignee(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ ...input, flex: 1, minWidth: 0 }} />
            <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...input, colorScheme: "dark" }} />
            <button onClick={() => add()} style={btnPrimary}>+</button>
          </div>
        </div>

        {seeds.filter(s => !existingTitles.has(s.title.trim().toLowerCase())).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8aa8", marginBottom: 6 }}>Idées de cette rétro</div>
            {seeds.filter(s => !existingTitles.has(s.title.trim().toLowerCase())).map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 13.5, color: "#ccc" }}>
                <span style={{ flex: 1 }}>{s.title}{s.votes ? <span style={{ color: "#f15bb5" }}> · {s.votes} vote{s.votes > 1 ? "s" : ""}</span> : null}</span>
                <button onClick={() => add(s.title, "", "")} style={{ ...btnGhost, padding: "4px 9px", fontSize: 12 }}>+ action</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8aa8", marginBottom: 6 }}>À faire ({open.length})</div>
        {items === null && !error && <p style={{ color: "#888", fontSize: 13 }}>Chargement…</p>}
        {items && open.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>Aucune action ouverte. 🎉</p>}
        {open.map(i => (
          <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 10px", background: "#1a1a2e", border: "1px solid #2a2a44", borderRadius: 10, marginBottom: 7 }}>
            <input type="checkbox" checked={false} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: "#eee" }}>{i.title}</div>
              <div style={{ fontSize: 11.5, color: "#777", marginTop: 3 }}>
                {i.assignee && <>👤 {i.assignee} · </>}
                {i.due_date && <span style={{ color: String(i.due_date).slice(0, 10) < today ? "#ff6b6b" : "#777" }}>📅 {String(i.due_date).slice(0, 10)} · </span>}
                {i.source_ref === sourceRef ? "cette rétro" : "rétro précédente"}
              </div>
            </div>
            <button onClick={() => del(i)} title="Supprimer" style={{ background: "none", border: "none", color: "#555", cursor: "pointer" }}>✕</button>
          </div>
        ))}

        {closed.length > 0 && (
          <>
            <button onClick={() => setShowDone(s => !s)} style={{ ...btnGhost, marginTop: 8, fontSize: 12 }}>{showDone ? "▲" : "▼"} Terminées ({closed.length})</button>
            {showDone && closed.map(i => (
              <div key={i.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", fontSize: 13.5, color: "#777" }}>
                <input type="checkbox" checked onChange={() => toggle(i)} />
                <span style={{ textDecoration: "line-through" }}>{i.title}</span>
              </div>
            ))}
          </>
        )}
        <a href={`/app/${bk.slug}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 16, color: ACCENT, fontSize: 13 }}>Ouvrir le backlog complet ›</a>
      </Gate>
    </div>
  );
}
