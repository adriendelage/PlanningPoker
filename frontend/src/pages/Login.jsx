import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi, setToken } from "../auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return setError("Renseigne ton email et ton mot de passe.");
    setLoading(true);
    try {
      const data = await authApi.login({ email, password });
      setToken(data.token);
      nav("/app");
    } catch (err) {
      setError(err.message || "Erreur de connexion.");
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
          <div style={{ fontSize: 44, marginBottom: 4 }}>🔐</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Espace de travail</h1>
          <p style={{ margin: "6px 0 0", color: "#555", fontSize: 14 }}>Connecte-toi à ton équipe</p>
        </div>

        <form onSubmit={submit} style={{ background: "#111", borderRadius: 16, padding: "28px 24px", border: "1px solid #222" }}>
          <label style={labelStyle}>Email</label>
          <input type="email" placeholder="toi@exemple.com" value={email}
            onChange={e => setEmail(e.target.value)} style={inputStyle} autoFocus autoComplete="email" />

          <label style={labelStyle}>Mot de passe</label>
          <input type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="current-password" />

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
            {loading ? "Connexion…" : "Se connecter →"}
          </button>

          <p style={{ margin: "18px 0 0", fontSize: 13.5, color: "#666", textAlign: "center" }}>
            Pas encore de compte ?{" "}
            <Link to="/register" style={{ color: "#00f5d4" }}>Créer un espace d'équipe</Link>
          </p>
        </form>

      </div>
    </div>
  );
}
