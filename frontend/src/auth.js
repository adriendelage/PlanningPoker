// Espace de travail connecté — client d'authentification.
// Le jeton JWT est stocké en localStorage et envoyé en en-tête
// Authorization: Bearer <token> à chaque appel protégé.
//
// Note de sécurité : localStorage est accessible à n'importe quel script
// JS exécuté sur la page (risque XSS), contrairement à un cookie httpOnly.
// C'est un compromis assumé pour éviter la complexité des cookies
// cross-domain (le frontend est sur Netlify, le backend sur Railway — deux
// domaines différents, ce qui complique sérieusement les cookies SameSite).
// Si l'espace de travail grandit, migrer vers un cookie httpOnly + un
// endpoint de refresh serait une amélioration de sécurité à considérer.

const TOKEN_KEY = "agile_toolbox_auth_token";
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(SERVER_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch { /* réponse vide, ignoré */ }

  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

export const authApi = {
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload }),
  me: () => request("/api/auth/me"),
};
