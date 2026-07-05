import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi, setToken } from "../auth";

export default function Register() {
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Ton nom est requis.");
    if (!email.trim()) return setError("Ton email est requis.");
    if (password.length < 8) return setError("Le mot de passe doit faire au moins 8 caractères.");
    setLoading(true);
    try {
      const data = await authApi.register({ name, email, password, orgName });
      setToken(data.token);
      nav("/app");
    } catch (err) {
      setError(err.message || "Erreur à l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", marginBottom: 16,
    background: "#1a1a2e", border: "1px solid #444", borderRadius: 10,
    color: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 14, color: "#aaa", marginBottom: 6, fontWeight: 500 };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420, color: "#fff" }}>

        <a href="/" style={{ display: "inline-block", color: "#666", fontSize: 14, textDecoration: "none", marginBottom: 16 }}>
          ← Retour aux outils
        </a>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 4 }}>🚀</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Créer un espace d'équipe</h1>
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 14 }}>Un compte, une organisation, prêt en 30 secondes</p>
        </div>

        <form onSubmit={submit} style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>
          <label style={labelStyle}>Ton nom</label>
          <input placeholder="Ex: Alice" value={name}
            onChange={e => setName(e.target.value)} style={inputStyle} autoFocus autoComplete="name" />

          <label style={labelStyle}>Nom de l'équipe (optionnel)</label>
          <input placeholder="Ex: Équipe Backend" value={orgName}
            onChange={e => setOrgName(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Email</label>
          <input type="email" placeholder="toi@exemple.com" value={email}
            onChange={e => setEmail(e.target.value)} style={inputStyle} autoComplete="email" />

          <label style={labelStyle}>Mot de passe</label>
          <input type="password" placeholder="8 caractères minimum" value={password}
            onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />

          {error && (
            <div style={{ background: "#2a1414", border: "1px solid #ff444455", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#ff8888", fontSize: 13.5 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: "100%", padding: 16, background: loading ? "#333" : "#00f5d4", border: "none", borderRadius: 10,
              fontWeight: "bold", cursor: loading ? "default" : "pointer", fontSize: 17, color: "#0d0d1a",
            }}>
            {loading ? "Création…" : "Créer mon espace →"}
          </button>

          <p style={{ margin: "18px 0 0", fontSize: 13.5, color: "#666", textAlign: "center" }}>
            Déjà un compte ?{" "}
            <Link to="/login" style={{ color: "#00f5d4" }}>Se connecter</Link>
          </p>
        </form>

      </div>
    </div>
  );
}
