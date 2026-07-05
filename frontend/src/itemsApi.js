import { authRequest } from "./auth";

// Client REST pour la table `items` partagée (étape 2 du mode connecté).
// Réutilise authRequest (jeton + gestion d'erreurs) déjà utilisé par auth.js.
export const itemsApi = {
  listSprints: (orgSlug) => authRequest(`/api/orgs/${orgSlug}/sprints`),
  createSprint: (orgSlug, payload) => authRequest(`/api/orgs/${orgSlug}/sprints`, { method: "POST", body: payload }),

  listItems: (orgSlug, sprintFilter) => {
    const qs = sprintFilter ? `?sprint=${encodeURIComponent(sprintFilter)}` : "";
    return authRequest(`/api/orgs/${orgSlug}/items${qs}`);
  },
  createItem: (orgSlug, payload) => authRequest(`/api/orgs/${orgSlug}/items`, { method: "POST", body: payload }),
  updateItem: (orgSlug, itemId, fields) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}`, { method: "PATCH", body: fields }),
  deleteItem: (orgSlug, itemId) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}`, { method: "DELETE" }),

  velocity: (orgSlug) => authRequest(`/api/orgs/${orgSlug}/velocity`),
};
