import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { authApi } from "../auth";
import { itemsApi } from "../itemsApi";

const ACCENT = "#00f5d4";
const COLUMNS = [
  { status: "todo", label: "À faire", accent: "#9b5de5" },
  { status: "in_progress", label: "En cours", accent: "#fee440" },
  { status: "done", label: "Terminé", accent: "#00f5d4" },
];

function ItemCard({ item, onMove, onDelete, colIndex, orgSlug }) {
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid #2a2a44", borderRadius: 10, padding: "11px 12px", marginBottom: 8 }}>
      <a href={`/app/${orgSlug}/items/${item.id}`}
        style={{ display: "block", fontSize: 14.5, color: "#ddd", marginBottom: 6, textDecoration: "none" }}>
        {item.title}
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#777" }}>
        {item.assignee && <span>👤 {item.assignee}</span>}
        {item.story_points != null && (
          <span style={{ marginLeft: "auto", color: ACCENT, fontWeight: 700 }}>{item.story_points} pts</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button onClick={() => onMove(item, COLUMNS[colIndex - 1]?.status)} disabled={colIndex === 0}
          style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: colIndex === 0 ? "#333" : "#aaa", fontSize: 13, padding: "3px 12px", cursor: colIndex === 0 ? "default" : "pointer" }}>←</button>
        <button onClick={() => onMove(item, COLUMNS[colIndex + 1]?.status)} disabled={colIndex === COLUMNS.length - 1}
          style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: colIndex === COLUMNS.length - 1 ? "#333" : "#aaa", fontSize: 13, padding: "3px 12px", cursor: colIndex === COLUMNS.length - 1 ? "default" : "pointer" }}>→</button>
        <button onClick={() => onDelete(item)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
      </div>
    </div>
  );
}

export default function OrgBoard() {
  const { orgSlug } = useParams();
  const [org, setOrg] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [items, setItems] = useState([]);
  const [sprintFilter, setSprintFilter] = useState("all"); // "all" | "backlog" | <id>
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", assignee: "", storyPoints: "" });
  const [newSprintName, setNewSprintName] = useState("");
  const [showSprintForm, setShowSprintForm] = useState(false);

  const loadAll = async () => {
    try {
      const me = await authApi.me();
      const found = me.orgs.find(o => o.slug === orgSlug);
      if (!found) { setError("Organisation introuvable ou accès refusé."); return; }
      setOrg(found);
      const [sprintList, itemList] = await Promise.all([
        itemsApi.listSprints(orgSlug),
        itemsApi.listItems(orgSlug, sprintFilter === "all" ? null : sprintFilter),
      ]);
      setSprints(sprintList);
      setItems(itemList);
    } catch (e) {
      setError(e.message || "Erreur de chargement.");
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [orgSlug, sprintFilter]);

  const addItem = async () => {
    if (!form.title.trim()) return;
    try {
      await itemsApi.createItem(orgSlug, {
        title: form.title,
        assignee: form.assignee || null,
        storyPoints: form.storyPoints !== "" ? form.storyPoints : null,
        sprintId: sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : null,
      });
      setForm({ title: "", assignee: "", storyPoints: "" });
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const moveItem = async (item, newStatus) => {
    if (!newStatus) return;
    try {
      await itemsApi.updateItem(orgSlug, item.id, { status: newStatus });
      loadAll();
    } catch (e) { setError(e.message); }
  };

  const deleteItem = async (item) => {
    try {
      await itemsApi.deleteItem(orgSlug, item.id);
      loadAll();
    } catch (e) { setError(e.message); }
  };

  const createSprint = async () => {
    if (!newSprintName.trim()) return;
    try {
      const sprint = await itemsApi.createSprint(orgSlug, { name: newSprintName });
      setNewSprintName("");
      setShowSprintForm(false);
      setSprints(s => [sprint, ...s]);
      setSprintFilter(String(sprint.id));
    } catch (e) { setError(e.message); }
  };

  const totalPoints = useMemo(
    () => items.reduce((sum, i) => sum + (i.story_points || 0), 0),
    [items]
  );
  const donePoints = useMemo(
    () => items.filter(i => i.status === "done").reduce((sum, i) => sum + (i.story_points || 0), 0),
    [items]
  );

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 44 }}>🚫</div>
          <p style={{ color: "#ff8888" }}>{error}</p>
          <a href="/app" style={{ color: ACCENT }}>← Retour à l'espace de travail</a>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Chargement du tableau…
      </div>
    );
  }

  const inputStyle = {
    padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444",
    borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <a href="/app" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Espace de travail</a>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🏢 {org.name}</h1>
          <a href={`/app/${orgSlug}/members`}
            style={{ marginLeft: "auto", fontSize: 13, color: "#aaa", textDecoration: "none", border: "1px solid #333", borderRadius: 999, padding: "5px 12px" }}>
            👥 Membres
          </a>
        </header>
        <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "#555" }}>
          Tableau connecté — Kanban, sprints et vélocité partagent la même donnée (table "items").
        </p>

        {/* Sélecteur de sprint + stats */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <select value={sprintFilter} onChange={e => setSprintFilter(e.target.value)} style={inputStyle}>
            <option value="all">Tous les items</option>
            <option value="backlog">Backlog (sans sprint)</option>
            {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => setShowSprintForm(s => !s)}
            style={{ padding: "10px 14px", background: "#1a1a2e", border: "1px solid #444", borderRadius: 8, color: "#aaa", cursor: "pointer", fontSize: 13.5 }}>
            + Nouveau sprint
          </button>
          {showSprintForm && (
            <>
              <input placeholder="Nom du sprint" value={newSprintName}
                onChange={e => setNewSprintName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createSprint()}
                style={inputStyle} />
              <button onClick={createSprint}
                style={{ padding: "10px 14px", background: ACCENT, border: "none", borderRadius: 8, color: "#0d0d1a", fontWeight: 700, cursor: "pointer", fontSize: 13.5 }}>
                Créer
              </button>
            </>
          )}
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#888" }}>
            <strong style={{ color: ACCENT }}>{donePoints}</strong> / {totalPoints} pts terminés
          </div>
        </div>

        {/* Ajout d'item */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
          <input placeholder="Titre de l'item" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && addItem()}
            style={{ ...inputStyle, flex: "2 1 200px" }} />
          <input placeholder="Assigné (optionnel)" value={form.assignee}
            onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
            style={{ ...inputStyle, flex: "1 1 140px" }} />
          <input placeholder="Points" type="number" min="0" value={form.storyPoints}
            onChange={e => setForm(f => ({ ...f, storyPoints: e.target.value }))}
            style={{ ...inputStyle, flex: "0 1 90px" }} />
          <button onClick={addItem}
            style={{ padding: "10px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 14 }}>
            + Ajouter
          </button>
        </div>

        {/* Colonnes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {COLUMNS.map((col, i) => {
            const colItems = items.filter(it => it.status === col.status);
            return (
              <div key={col.status} style={{ background: "#111", border: "1px solid #222", borderTop: `3px solid ${col.accent}`, borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: col.accent }}>{col.label}</h2>
                  <span style={{ fontSize: 12, color: "#555" }}>{colItems.length}</span>
                </div>
                {colItems.map(item => (
                  <ItemCard key={item.id} item={item} colIndex={i} onMove={moveItem} onDelete={deleteItem} orgSlug={orgSlug} />
                ))}
                {colItems.length === 0 && <p style={{ color: "#444", fontSize: 13 }}>Aucun item.</p>}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
