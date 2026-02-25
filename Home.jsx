import { io } from "socket.io-client";

// En dev : localhost:3001
// En prod : même hôte que le frontend, port 3001
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

const socket = io(SERVER_URL);

export default socket;
