import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { authApi } from "../auth";
import { membersApi } from "../itemsApi";

const ACCENT = "#00f5d4";
const ROLE_LABEL = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const ROLE_COLOR = { owner: "#ff9f1c", admin: "#00bbf9", member: "#9b5de5" };

export default function OrgMembers() {
  const { orgSlug } = useParams();
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const meData = await authApi.me();
      setMe(meData.user);
      const list = await membersApi.list(orgSlug);
      setMembers(list);
    } catch (e) {
      setError(e.message || "Erreur de chargement.");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgSlug]);

  const myMembership = members.find(m => m.email === me?.email);
  const canManage = myMembership && (myMembership.role === "owner" || myMembership.role === "admin");
  const isOwner = myMembership?.role === "owner";

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const res = await membersApi.invite(orgSlug, inviteEmail, inviteRole);
      setInviteLink(`${window.location.origin}/invite/${res.token}`);
      setInviteEmail("");
      setInviteRole("member");
    } catch (e) { setError(e.message); }
  };

  const changeRole = async (userId, role) => {
    try {
      await membersApi.updateRole(orgSlug, userId, role);
      load();
    } catch (e) { setError(e.message); }
  };

  const removeMember = async (userId) => {
    try {
      await membersApi.remove(orgSlug, userId);
      load();
    } catch (e) { setError(e.message); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!me) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Chargement…
      </div>
    );
  }

  const inputStyle = {
    padding: "10px 12px", background: "#1a1a2e", border: "1px solid #444",
    borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <a href={`/app/${orgSlug}/board`} style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Tableau</a>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>👥 Membres de l'équipe</h1>
        </header>

        {error && (
          <div style={{ background: "#2a1414", border: "1px solid #ff444455", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#ff8888", fontSize: 13.5 }}>
            {error}
          </div>
        )}

        {/* Invitation */}
        {canManage && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>Inviter quelqu'un</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input type="email" placeholder="email@exemple.com" value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                style={{ ...inputStyle, flex: "2 1 200px" }} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputStyle, flex: "0 1 140px" }}>
                <option value="member">Membre</option>
                <option value="admin">Administrateur</option>
                {isOwner && <option value="owner">Propriétaire</option>}
              </select>
              <button onClick={invite}
                style={{ padding: "10px 18px", background: ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 14 }}>
                Générer le lien
              </button>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#666" }}>
              Pas d'email envoyé automatiquement — copie ce lien et partage-le toi-même
              (par Slack, email, etc.). Valable 7 jours.
            </p>
            {inviteLink && (
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, background: "#1a1a2e", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inviteLink}
                </code>
                <button onClick={copyLink}
                  style={{ padding: "0 16px", background: copied ? "#00f5d4" : "#1a1a2e", border: "1px solid #444", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: copied ? "#0d0d1a" : "#aaa", fontSize: 13 }}>
                  {copied ? "✓ Copié" : "Copier"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Liste des membres */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, overflow: "hidden" }}>
          {members.map((m, i) => (
            <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderTop: i > 0 ? "1px solid #1c1c30" : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15 }}>{m.name}{m.email === me.email && <span style={{ color: "#555" }}> (toi)</span>}</div>
                <div style={{ fontSize: 12.5, color: "#666" }}>{m.email}</div>
              </div>
              {isOwner && m.email !== me.email ? (
                <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}
                  style={{ ...inputStyle, fontSize: 12.5, padding: "5px 10px", color: ROLE_COLOR[m.role] }}>
                  <option value="member">Membre</option>
                  <option value="admin">Administrateur</option>
                  <option value="owner">Propriétaire</option>
                </select>
              ) : (
                <span style={{ fontSize: 11.5, color: ROLE_COLOR[m.role], border: `1px solid ${ROLE_COLOR[m.role]}55`, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>
                  {ROLE_LABEL[m.role]}
                </span>
              )}
              {isOwner && m.email !== me.email && (
                <button onClick={() => removeMember(m.user_id)}
                  style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}>✕</button>
              )}
            </div>
          ))}
        </div>

        {!canManage && (
          <p style={{ marginTop: 16, fontSize: 13, color: "#555" }}>
            Seuls les propriétaires et administrateurs peuvent inviter de nouveaux membres.
          </p>
        )}

      </div>
    </div>
  );
}
