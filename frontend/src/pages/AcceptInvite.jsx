import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { invitationsApi } from "../itemsApi";

const ACCENT = "#00f5d4";
const ROLE_LABEL = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };

export default function AcceptInvite() {
  const { token } = useParams();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    invitationsApi.get(token).then(setInvite).catch(e => setError(e.message));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const res = await invitationsApi.accept(token);
      setDone(true);
      setTimeout(() => nav(`/app/${res.orgSlug}/board`), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccepting(false);
    }
  };

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 44 }}>🚫</div>
          <p style={{ color: "#ff8888" }}>{error}</p>
          <a href="/app" style={{ color: ACCENT }}>← Aller à l'espace de travail</a>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Chargement de l'invitation…
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 44 }}>🎉</div>
          <p>Bienvenue dans {invite.orgName} !</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420, color: "#fff", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>✉️</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700 }}>Invitation à rejoindre</h1>
        <p style={{ margin: "0 0 28px", fontSize: 18, color: ACCENT, fontWeight: 700 }}>{invite.orgName}</p>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "22px 24px", textAlign: "left" }}>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#999" }}>
            Rôle proposé : <strong style={{ color: "#fff" }}>{ROLE_LABEL[invite.role]}</strong>
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#999" }}>
            Destinée à : <strong style={{ color: "#fff" }}>{invite.email}</strong>
          </p>

          {invite.alreadyAccepted && (
            <p style={{ color: "#ff8888", fontSize: 13.5 }}>Cette invitation a déjà été utilisée.</p>
          )}
          {invite.expired && !invite.alreadyAccepted && (
            <p style={{ color: "#ff8888", fontSize: 13.5 }}>Cette invitation a expiré.</p>
          )}
          {!invite.emailMatches && !invite.expired && !invite.alreadyAccepted && (
            <p style={{ color: "#fee440", fontSize: 13.5 }}>
              ⚠️ Tu es connecté avec une adresse différente de celle invitée — l'acceptation sera refusée.
            </p>
          )}

          {!invite.alreadyAccepted && !invite.expired && (
            <button onClick={accept} disabled={accepting}
              style={{ width: "100%", padding: 14, marginTop: 8, background: accepting ? "#333" : ACCENT, border: "none", borderRadius: 10, fontWeight: "bold", cursor: accepting ? "default" : "pointer", fontSize: 15, color: "#0d0d1a" }}>
              {accepting ? "…" : "Accepter l'invitation →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
