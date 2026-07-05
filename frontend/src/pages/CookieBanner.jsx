import { useEffect, useState } from "react";
import { getCookieConsent, setCookieConsent } from "../cookieConsent";

// RGPD : le refus doit être aussi simple et visible que l'acceptation —
// pas de bouton "Accepter" en évidence et un lien minuscule "refuser" en
// petit gris (pattern interdit, dit "dark pattern"). Les deux boutons ont
// ici exactement le même traitement visuel.
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (value) => {
    setCookieConsent(value);
    setVisible(false);
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: "#111", borderTop: "1px solid #333",
      padding: "16px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
    }}>
      <div style={{
        maxWidth: 980, margin: "0 auto",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
      }}>
        <p style={{ flex: "1 1 320px", margin: 0, fontSize: 13.5, color: "#ccc", lineHeight: 1.5 }}>
          🍪 Ce site n'utilise que des données strictement nécessaires à son
          fonctionnement (connexion, préférences locales) — aucun cookie
          publicitaire ou de mesure d'audience pour l'instant. Si des
          fonctionnalités futures en ajoutent, ton choix ci-dessous sera
          respecté.{" "}
          <a href="/confidentialite" style={{ color: "#00f5d4" }}>En savoir plus</a>
        </p>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={() => choose("rejected")}
            style={{
              padding: "10px 20px", background: "#1a1a2e", border: "1px solid #444",
              borderRadius: 8, color: "#ddd", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>
            Refuser
          </button>
          <button onClick={() => choose("accepted")}
            style={{
              padding: "10px 20px", background: "#00f5d4", border: "1px solid #00f5d4",
              borderRadius: 8, color: "#0d0d1a", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
