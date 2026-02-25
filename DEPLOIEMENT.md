import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";

export default function Home(){
  const [sessionName,setSessionName]=useState("");
  const [hostName,setHostName]=useState("");
  const [tasks,setTasks]=useState([""]);
  const nav=useNavigate();

  const create=()=>{
    if(!hostName.trim()) return alert("Veuillez saisir votre nom");
    socket.emit("session:create",{sessionName,tasks,hostName},(id)=>{
      nav("/poker/"+id+"?host=true");
    });
  };

  const inputStyle={
    width:"100%",
    padding:10,
    marginBottom:20,
    background:"#1a1a2e",
    border:"1px solid #444",
    borderRadius:8,
    color:"#fff",
    fontSize:15,
    boxSizing:"border-box"
  };

  return (
    <div style={{padding:40,maxWidth:600,margin:"auto",color:"#fff",minHeight:"100vh",background:"#0d0d1a"}}>
      <h1>🃏 Planning Poker</h1>

      <label style={{fontSize:13,color:"#aaa"}}>Ton nom (hôte)</label>
      <input placeholder="Ex: Alice" value={hostName}
        onChange={e=>setHostName(e.target.value)}
        style={inputStyle}/>

      <label style={{fontSize:13,color:"#aaa"}}>Nom de la session</label>
      <input placeholder="Ex: Sprint 42" value={sessionName}
        onChange={e=>setSessionName(e.target.value)}
        style={inputStyle}/>

      <h3>Tâches</h3>
      {tasks.map((t,i)=>(
        <input key={i} value={t}
          placeholder={"Tâche "+(i+1)}
          onChange={e=>{
            const copy=[...tasks]; copy[i]=e.target.value; setTasks(copy);
          }}
          style={{...inputStyle,marginBottom:10}}/>
      ))}

      <div style={{display:"flex",gap:10,marginTop:10}}>
        <button onClick={()=>setTasks([...tasks,""])}
          style={{padding:"8px 16px",background:"#333",color:"#fff",border:"1px solid #555",borderRadius:8,cursor:"pointer"}}>
          + Ajouter une tâche
        </button>
        <button onClick={create}
          style={{padding:"8px 16px",background:"#00f5d4",border:"none",borderRadius:8,fontWeight:"bold",cursor:"pointer"}}>
          Créer la session
        </button>
      </div>
    </div>
  )
}
