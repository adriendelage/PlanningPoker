
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Invite from "./pages/Invite.jsx";
import Poker from "./pages/Poker.jsx";

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/join/:id" element={<Invite/>}/>
      <Route path="/poker/:id" element={<Poker/>}/>
    </Routes>
  )
}
