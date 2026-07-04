import { useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";
import { addLocalSession } from "../localHistory";

export default function Home(){
  const [sessionName,setSessionName]=useState("");
  const [hostName,setHostName]=useState("");
  const [tasks,setTasks]=useState([""]);
  const nav=useNavigate();

  const create=()=>{
    if(!hostName.trim()) return alert("Veuillez saisir votre nom");
    socket.emit("session:create",{sessionName,tasks,hostName},(id)=>{
      addLocalSession({ id, tool: "poker", name: sessionName, role: "host" });
      nav("/poker/"+id+"?host=true");
    });
  };

  const inputStyle={
    width:"100%",
    padding:"14px 16px",
    marginBottom:20,
    background:"#1a1a2e",
    border:"1px solid #444",
    borderRadius:10,
    color:"#fff",
    fontSize:16,
    outline:"none",
    transition:"border-color 0.2s",
  };

  const labelStyle={
    display:"block",
    fontSize:14,
    color:"#aaa",
    marginBottom:6,
    fontWeight:500,
    letterSpacing:"0.3px"
  };

  return (
    <div style={{minHeight:"100vh",background:"#0d0d1a",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <div style={{width:"100%",maxWidth:540,color:"#fff"}}>

        <a href="/" style={{display:"inline-block",color:"#666",fontSize:14,textDecoration:"none",marginBottom:16}}>
          ← Retour aux outils
        </a>

        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontSize:52,marginBottom:8}}>🃏</div>
          <h1 style={{margin:0,fontSize:32,fontWeight:700,color:"#00f5d4"}}>Planning Poker</h1>
          <p style={{margin:"8px 0 0",color:"#555",fontSize:15}}>Créer une nouvelle session</p>
        </div>

        <div style={{background:"#111",borderRadius:16,padding:"28px 24px",border:"1px solid #222"}}>

          <label style={labelStyle}>Ton nom (hôte)</label>
          <input placeholder="Ex: Alice" value={hostName}
            onChange={e=>setHostName(e.target.value)}
            style={inputStyle}/>

          <label style={labelStyle}>Nom de la session</label>
          <input placeholder="Ex: Sprint 42" value={sessionName}
            onChange={e=>setSessionName(e.target.value)}
            style={inputStyle}/>

          <label style={{...labelStyle,marginTop:4}}>Tâches à estimer</label>
          {tasks.map((t,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:10}}>
              <input value={t}
                placeholder={"Tâche "+(i+1)}
                onChange={e=>{
                  const copy=[...tasks]; copy[i]=e.target.value; setTasks(copy);
                }}
                style={{...inputStyle,marginBottom:0,flex:1}}/>
              {tasks.length>1 && (
                <button onClick={()=>setTasks(tasks.filter((_,j)=>j!==i))}
                  style={{padding:"0 14px",background:"#1a1a2e",border:"1px solid #333",borderRadius:10,color:"#666",cursor:"pointer",fontSize:18,flexShrink:0}}>
                  ×
                </button>
              )}
            </div>
          ))}

          <button onClick={()=>setTasks([...tasks,""])}
            style={{width:"100%",padding:"12px",background:"transparent",color:"#555",border:"1px dashed #333",borderRadius:10,cursor:"pointer",fontSize:15,marginBottom:20,marginTop:4}}>
            + Ajouter une tâche
          </button>

          <button onClick={create}
            style={{width:"100%",padding:"16px",background:"#00f5d4",border:"none",borderRadius:10,fontWeight:"bold",cursor:"pointer",fontSize:17,color:"#0d0d1a",letterSpacing:"0.3px"}}>
            Créer la session →
          </button>

        </div>
      </div>
    </div>
  );
}
