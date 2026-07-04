import { Routes, Route } from "react-router-dom";
import Hub from "./pages/Hub.jsx";
import Home from "./pages/Home.jsx";
import Invite from "./pages/Invite.jsx";
import Poker from "./pages/Poker.jsx";
import RetroHome from "./pages/RetroHome.jsx";
import RetroInvite from "./pages/RetroInvite.jsx";
import Retro from "./pages/Retro.jsx";
import DailyHome from "./pages/DailyHome.jsx";
import DailyInvite from "./pages/DailyInvite.jsx";
import Daily from "./pages/Daily.jsx";
import KanbanHome from "./pages/KanbanHome.jsx";
import Kanban from "./pages/Kanban.jsx";
import VelocityHome from "./pages/VelocityHome.jsx";
import Velocity from "./pages/Velocity.jsx";
import OkrHome from "./pages/OkrHome.jsx";
import Okr from "./pages/Okr.jsx";
import GanttHome from "./pages/GanttHome.jsx";
import Gantt from "./pages/Gantt.jsx";
import CapacityHome from "./pages/CapacityHome.jsx";
import Capacity from "./pages/Capacity.jsx";

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

      {/* Daily Timer */}
      <Route path="/daily" element={<DailyHome/>}/>
      <Route path="/daily/join/:id" element={<DailyInvite/>}/>
      <Route path="/daily/:id" element={<Daily/>}/>

      {/* Kanban */}
      <Route path="/kanban" element={<KanbanHome/>}/>
      <Route path="/kanban/:id" element={<Kanban/>}/>

      {/* Suivi de vélocité */}
      <Route path="/velocity" element={<VelocityHome/>}/>
      <Route path="/velocity/:id" element={<Velocity/>}/>

      {/* OKR léger */}
      <Route path="/okr" element={<OkrHome/>}/>
      <Route path="/okr/:id" element={<Okr/>}/>

      {/* Rétro-planning (Gantt + chemin critique) */}
      <Route path="/gantt" element={<GanttHome/>}/>
      <Route path="/gantt/:id" element={<Gantt/>}/>

      {/* Planificateur de capacité */}
      <Route path="/capacity" element={<CapacityHome/>}/>
      <Route path="/capacity/:id" element={<Capacity/>}/>
    </Routes>
  )
}
