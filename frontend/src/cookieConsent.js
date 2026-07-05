// Gestion du consentement aux cookies (RGPD / ePrivacy).
//
// Important : cette app n'utilise aujourd'hui QUE des données strictement
// nécessaires à son fonctionnement (jeton de connexion, historique local
// des sessions) — pas de cookies tiers, pas de pub, pas de mesure
// d'audience. Le RGPD n'exige pas de consentement pour ce type de donnée
// "strictement nécessaire". Ce module est mis en place par anticipation,
// prêt à conditionner le chargement d'AdSense (ou de tout autre script
// tiers) le jour où il sera ajouté — pas parce que c'est requis aujourd'hui.
//
// Fonctionnement : "accepted" / "rejected" stocké en localStorage. Tant
// qu'aucun choix n'a été fait, la bannière s'affiche. Un événement custom
// "cookieconsent" est déclenché à chaque changement, pour que d'autres
// parties de l'app (ex: le chargement du script AdSense) puissent réagir
// sans être couplées directement à ce module.

const KEY = "agile_toolbox_cookie_consent";

export function getCookieConsent() {
  try {
    return localStorage.getItem(KEY); // "accepted" | "rejected" | null
  } catch {
    return null;
  }
}

export function setCookieConsent(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // localStorage indisponible (navigation privée stricte...) — on
    // n'affichera simplement plus la bannière tant que la session dure,
    // sans bloquer l'utilisateur.
  }
  window.dispatchEvent(new CustomEvent("cookieconsent", { detail: value }));
}

export function hasConsentDecision() {
  return getCookieConsent() === "accepted" || getCookieConsent() === "rejected";
}
