import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authApi, getToken, clearToken } from "./auth";

// Protège les routes de l'espace de travail connecté (/app/*).
// Vérifie le jeton auprès du serveur (pas seulement sa présence locale) :
// un jeton présent mais expiré ou invalide doit renvoyer vers /login.
export default function RequireAuth({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ok | out

  useEffect(() => {
    if (!getToken()) { setStatus("out"); return; }
    authApi.me()
      .then(() => setStatus("ok"))
      .catch(() => { clearToken(); setStatus("out"); });
  }, []);

  if (status === "checking") {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Vérification de la session…
      </div>
    );
  }
  if (status === "out") return <Navigate to="/login" replace />;
  return children;
}
