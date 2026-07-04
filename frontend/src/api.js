// Client API REST — même origine que le Socket.IO
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

async function get(path) {
  const res = await fetch(SERVER_URL + path);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const api = {
  health: () => get("/api/health"),
  listSessions: (limit = 10) => get(`/api/sessions?limit=${limit}`),
  getSession: (id) => get(`/api/sessions/${id}`),
};
