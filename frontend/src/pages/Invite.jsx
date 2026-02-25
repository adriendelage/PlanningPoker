import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import socket from "../socket";

export default function Invite(){
  const {id}=useParams();
  const [name,setName]=useState("");
  const nav=useNavigate();

  const join=()=>{
    if(!name.trim()) return alert("Veuillez saisir votre nom");
    socket.emit("session:join",{id,name});
    nav("/poker/"+id);
  };

  return (
    <div style={{padding:40,textAlign:"center",color:"#fff",minHeight:"100vh",background:"#0d0d1a"}}>
      <h2>🃏 Rejoindre la session</h2>
      <input placeholder="Votre prénom"
        value={name}
        onChange={e=>setName(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&join()}
        style={{padding:10,fontSize:16,background:"#1a1a2e",border:"1px solid #444",borderRadius:8,color:"#fff",width:220}}/>
      <br/><br/>
      <button onClick={join}
        style={{padding:"10px 20px",background:"#00f5d4",border:"none",borderRadius:8,fontWeight:"bold",cursor:"pointer"}}>
        Rejoindre
      </button>
    </div>
  )
}
