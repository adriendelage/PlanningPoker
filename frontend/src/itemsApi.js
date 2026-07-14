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
  burndown: (orgSlug, sprintId) => authRequest(`/api/orgs/${orgSlug}/sprints/${sprintId}/burndown`),

  // Étape 3 : fiche détail (commentaires, activité, dépendances)
  getItemDetail: (orgSlug, itemId) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}/detail`),
  addComment: (orgSlug, itemId, body) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}/comments`, { method: "POST", body: { body } }),
  addDependency: (orgSlug, itemId, dependsOnId) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}/dependencies`, { method: "POST", body: { dependsOnId } }),
  removeDependency: (orgSlug, itemId, depId) => authRequest(`/api/orgs/${orgSlug}/items/${itemId}/dependencies/${depId}`, { method: "DELETE" }),
};

// Étape 4 : membres et invitations
export const membersApi = {
  list: (orgSlug) => authRequest(`/api/orgs/${orgSlug}/members`),
  updateRole: (orgSlug, userId, role) => authRequest(`/api/orgs/${orgSlug}/members/${userId}`, { method: "PATCH", body: { role } }),
  remove: (orgSlug, userId) => authRequest(`/api/orgs/${orgSlug}/members/${userId}`, { method: "DELETE" }),
  invite: (orgSlug, email, role) => authRequest(`/api/orgs/${orgSlug}/invitations`, { method: "POST", body: { email, role } }),
};

export const invitationsApi = {
  get: (token) => authRequest(`/api/invitations/${token}`),
  accept: (token) => authRequest(`/api/invitations/${token}/accept`, { method: "POST" }),
};
