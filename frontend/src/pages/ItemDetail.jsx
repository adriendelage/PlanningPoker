import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { itemsApi } from "../itemsApi";

const ACCENT = "#00f5d4";
const STATUS_LABEL = { todo: "À faire", in_progress: "En cours", done: "Terminé" };
const STATUS_COLOR = { todo: "#9b5de5", in_progress: "#fee440", done: "#00f5d4" };

function activityLabel(a) {
  switch (a.action) {
    case "created": return "a créé cet item";
    case "status_changed": return `a changé le statut : ${STATUS_LABEL[a.details.from] || a.details.from} → ${STATUS_LABEL[a.details.to] || a.details.to}`;
    case "updated": return `a modifié : ${(a.details.fields || []).join(", ")}`;
    case "comment_added": return "a ajouté un commentaire";
    case "dependency_added": return "a ajouté une dépendance";
    case "dependency_removed": return "a retiré une dépendance";
    default: return a.action;
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ItemDetail() {
  const { orgSlug, itemId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [depCandidate, setDepCandidate] = useState("");

  const load = async () => {
    try {
      const detail = await itemsApi.getItemDetail(orgSlug, itemId);
      setData(detail);
      setDescDraft(detail.item.description || "");
    } catch (e) {
      setError(e.message || "Erreur de chargement.");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgSlug, itemId]);

  const updateField = async (fields) => {
    try {
      await itemsApi.updateItem(orgSlug, itemId, fields);
      load();
    } catch (e) { setError(e.message); }
  };

  const saveDescription = () => {
    if (descDraft !== data.item.description) updateField({ description: descDraft });
  };

  const addComment = async () => {
    if (!commentDraft.trim()) return;
    try {
      await itemsApi.addComment(orgSlug, itemId, commentDraft);
      setCommentDraft("");
      load();
    } catch (e) { setError(e.message); }
  };

  const addDependency = async () => {
    if (!depCandidate) return;
    try {
      await itemsApi.addDependency(orgSlug, itemId, parseInt(depCandidate));
      setDepCandidate("");
      load();
    } catch (e) { setError(e.message); }
  };

  const removeDependency = async (depId) => {
    try {
      await itemsApi.removeDependency(orgSlug, itemId, depId);
      load();
    } catch (e) { setError(e.message); }
  };

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 44 }}>🚫</div>
          <p style={{ color: "#ff8888" }}>{error}</p>
          <a href={`/app/${orgSlug}/board`} style={{ color: ACCENT }}>← Retour au tableau</a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Chargement…
      </div>
    );
  }

  const { item, comments, activity, dependencies, candidates } = data;
  const availableCandidates = candidates.filter(c => !dependencies.some(d => d.id === c.id));

  const inputStyle = {
    padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444",
    borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <a href={`/app/${orgSlug}/board`} style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Retour au tableau</a>

        <h1 style={{ margin: "16px 0 6px", fontSize: 24, fontWeight: 700 }}>{item.title}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 24 }}>
          <select value={item.status} onChange={e => updateField({ status: e.target.value })}
            style={{ ...inputStyle, color: STATUS_COLOR[item.status], fontWeight: 700 }}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Assigné" defaultValue={item.assignee || ""}
            onBlur={e => e.target.value !== (item.assignee || "") && updateField({ assignee: e.target.value || null })}
            style={{ ...inputStyle, width: 140 }} />
          <input placeholder="Points" type="number" min="0" defaultValue={item.story_points ?? ""}
            onBlur={e => updateField({ storyPoints: e.target.value !== "" ? e.target.value : null })}
            style={{ ...inputStyle, width: 90 }} />
        </div>

        {/* Description */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Description</h2>
          <textarea value={descDraft} rows={4} placeholder="Détaille cet item…"
            onChange={e => setDescDraft(e.target.value)}
            onBlur={saveDescription}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
        </section>

        {/* Dépendances */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Dépend de</h2>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            {dependencies.length === 0 && <p style={{ color: "#555", fontSize: 13, margin: 0 }}>Aucune dépendance.</p>}
            {dependencies.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <span style={{ fontSize: 11, color: STATUS_COLOR[d.status], border: `1px solid ${STATUS_COLOR[d.status]}55`, borderRadius: 999, padding: "1px 8px" }}>
                  {STATUS_LABEL[d.status]}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>{d.title}</span>
                <button onClick={() => removeDependency(d.id)} style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
          {availableCandidates.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <select value={depCandidate} onChange={e => setDepCandidate(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">Choisir un item…</option>
                {availableCandidates.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <button onClick={addDependency}
                style={{ padding: "0 16px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", color: "#0d0d1a", fontSize: 13.5 }}>
                + Ajouter
              </button>
            </div>
          )}
        </section>

        {/* Commentaires */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Commentaires</h2>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            {comments.length === 0 && <p style={{ color: "#555", fontSize: 13, padding: "14px 16px", margin: 0 }}>Aucun commentaire.</p>}
            {comments.map((c, i) => (
              <div key={c.id} style={{ padding: "12px 16px", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
                <div style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#666", marginBottom: 4 }}>
                  <strong style={{ color: "#999" }}>{c.user_name || "Utilisateur supprimé"}</strong>
                  <span>{fmtDate(c.created_at)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "#ddd" }}>{c.body}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Ajouter un commentaire…" value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={addComment}
              style={{ padding: "0 16px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", color: "#0d0d1a", fontSize: 13.5 }}>
              Envoyer
            </button>
          </div>
        </section>

        {/* Historique d'activité */}
        <section>
          <h2 style={{ fontSize: 15, color: "#aaa", marginBottom: 10 }}>Historique</h2>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
            {activity.map((a, i) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 16px", borderTop: i > 0 ? "1px solid #1c1c30" : "none", fontSize: 13 }}>
                <span style={{ color: "#666", whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</span>
                <span style={{ color: "#999" }}><strong style={{ color: "#bbb" }}>{a.user_name || "Utilisateur supprimé"}</strong> {activityLabel(a)}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
