import { io } from "socket.io-client";

// Priorité :
// 1. Variable d'env VITE_SERVER_URL (définie sur Netlify pour pointer vers Railway/Render)
// 2. En dev local : proxy Vite → pas besoin d'URL absolue, on utilise window.location
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"]
});

export default socket;
