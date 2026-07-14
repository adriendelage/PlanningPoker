import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, clearToken } from "../auth";

// Étape 1 du mode connecté : cette page prouve que l'authentification
// fonctionne de bout en bout (inscription/connexion → jeton → route
// protégée → déconnexion). Les vraies fonctionnalités (table d'items
// partagée, vues Kanban/Gantt/Vélocité connectées) arrivent à l'étape 2.
export default function AppHome() {
  const [me, setMe] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    authApi.me().then(setMe).catch(() => nav("/login"));
  }, [nav]);

  const logout = () => {
    clearToken();
    nav("/login");
  };

  if (!me) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Mode lien (outils publics)</a>
          <button onClick={logout}
            style={{ marginLeft: "auto", padding: "7px 14px", background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            Déconnexion
          </button>
        </header>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>👋</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Bienvenue, {me.user.name}</h1>
          <p style={{ margin: "8px 0 0", color: "#666", fontSize: 14 }}>{me.user.email}</p>
        </div>

        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "20px 22px", marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 15, color: "#aaa" }}>Tes organisations</h2>
          {me.orgs.map(org => (
            <div key={org.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #1c1c30" }}>
              <span style={{ fontSize: 18 }}>🏢</span>
              <span style={{ flex: 1, fontSize: 15 }}>{org.name}</span>
              <span style={{ fontSize: 12, color: "#666" }}>/{org.slug}</span>
              <span style={{ fontSize: 11, color: "#00f5d4", border: "1px solid #00f5d444", borderRadius: 999, padding: "2px 8px" }}>
                {org.role}
              </span>
              <a href={`/app/${org.slug}/board`}
                style={{ fontSize: 12.5, color: "#00f5d4", border: "1px solid #00f5d444", borderRadius: 999, padding: "4px 12px", textDecoration: "none", fontWeight: 600 }}>
                Ouvrir le tableau →
              </a>
            </div>
          ))}
        </div>

        <div style={{ background: "#111", border: "1px dashed #333", borderRadius: 14, padding: "20px 22px", textAlign: "center", color: "#666" }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            👆 Clique sur <strong style={{ color: "#00f5d4" }}>« Ouvrir le tableau »</strong> pour accéder au
            Kanban, aux sprints et à la vélocité de ton organisation — c'est là
            que tout se passe, cette page ne fait que lister tes organisations.
          </p>
        </div>

      </div>
    </div>
  );
}
