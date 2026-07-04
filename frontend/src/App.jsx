import { Routes, Route } from "react-router-dom";
import Hub from "./pages/Hub.jsx";
import Home from "./pages/Home.jsx";
import Invite from "./pages/Invite.jsx";
import Poker from "./pages/Poker.jsx";
import RetroHome from "./pages/RetroHome.jsx";
import RetroInvite from "./pages/RetroInvite.jsx";
import Retro from "./pages/Retro.jsx";

export default function App(){
  return (
    <Routes>
      {/* Hub d'accueil — accès à tous les outils */}
      <Route path="/" element={<Hub/>}/>

      {/* Planning Poker */}
      <Route path="/poker" element={<Home/>}/>
      <Route path="/join/:id" element={<Invite/>}/>
      <Route path="/poker/:id" element={<Poker/>}/>

      {/* Rétrospective */}
      <Route path="/retro" element={<RetroHome/>}/>
      <Route path="/retro/join/:id" element={<RetroInvite/>}/>
      <Route path="/retro/:id" element={<Retro/>}/>
    </Routes>
  )
}
