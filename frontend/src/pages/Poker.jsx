import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import socket from "../socket";

const cards=[0,1,3,5,8,13,21,"?"];

// ─── Timer display (top-right, visible to all) ────────────────────────────────
function TimerBadge({ seconds }){
  if(seconds==null) return null;
  const mins=Math.floor(seconds/60);
  const secs=seconds%60;
  const label=mins>0
    ? `${mins}:${String(secs).padStart(2,"0")}`
    : `${seconds}s`;
  const urgent=seconds<=10;
  return (
    <div style={{
      position:"fixed",top:20,right:20,
      background: urgent ? "#ff4444" : "#1a1a2e",
      border: urgent ? "2px solid #ff4444" : "2px solid #00f5d4",
      borderRadius:12,
      padding:"10px 18px",
      fontSize:28,
      fontWeight:"bold",
      color: urgent ? "#fff" : "#00f5d4",
      fontVariantNumeric:"tabular-nums",
      boxShadow: urgent ? "0 0 20px #ff444466" : "0 0 12px #00f5d444",
      transition:"background 0.3s, border-color 0.3s",
      zIndex:100,
      letterSpacing:2
    }}>
      ⏱ {label}
    </div>
  );
}

// ─── Host timer panel (top-right when no timer running) ───────────────────────
function TimerPanel({ id, timerSeconds }){
  const [input,setInput]=useState("");
  const [open,setOpen]=useState(false);

  const launch=()=>{
    const v=parseInt(input,10);
    if(!v||v<=0) return;
    socket.emit("timer:start",{id, seconds:v});
    setOpen(false);
    setInput("");
  };

  // If timer is running, show stop button instead
  if(timerSeconds!=null){
    return (
      <div style={{position:"fixed",top:90,right:20,zIndex:200}}>
        <button onClick={()=>socket.emit("timer:stop",{id})}
          style={{padding:"8px 14px",background:"#ff4444",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:"bold",fontSize:13}}>
          ⏹ Stop timer
        </button>
      </div>
    );
  }

  return (
    <div style={{position:"fixed",top:20,right:20,zIndex:200}}>
      {!open
        ? <button onClick={()=>setOpen(true)}
            style={{padding:"8px 14px",background:"#1a1a2e",border:"1px solid #00f5d4",borderRadius:8,color:"#00f5d4",cursor:"pointer",fontWeight:"bold"}}>
            ⏱ Timer
          </button>
        : <div style={{background:"#1a1a2e",border:"1px solid #00f5d4",borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:8,minWidth:160}}>
            <span style={{color:"#aaa",fontSize:12}}>Durée (secondes)</span>
            <input
              type="number" min="5" max="600"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&launch()}
              placeholder="Ex: 60"
              style={{padding:8,background:"#0d0d1a",border:"1px solid #444",borderRadius:6,color:"#fff",fontSize:15,width:"100%",boxSizing:"border-box"}}
              autoFocus
            />
            <div style={{display:"flex",gap:6}}>
              <button onClick={launch}
                style={{flex:1,padding:"7px 0",background:"#00f5d4",border:"none",borderRadius:6,fontWeight:"bold",cursor:"pointer"}}>
                Lancer
              </button>
              <button onClick={()=>setOpen(false)}
                style={{padding:"7px 10px",background:"#333",border:"none",borderRadius:6,color:"#aaa",cursor:"pointer"}}>
                ✕
              </button>
            </div>
          </div>
      }
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Poker(){
  const {id}=useParams();
  const [search]=useSearchParams();
  const isHost=search.get("host")==="true";

  const [state,setState]=useState(null);
  const [selected,setSelected]=useState(null);
  const prevRevealed=useRef(false);

  useEffect(()=>{
    socket.emit("poker:state",{id, isHost});
    socket.on("state",(s)=>{
      setState(s);
      // Reset selected card when moving to next round
      if(prevRevealed.current && !s.revealed){
        setSelected(null);
      }
      prevRevealed.current=s.revealed;
    });
    return ()=> socket.off("state");
  },[]);

  if(!state) return <div style={{padding:40,color:"#fff",background:"#0d0d1a",minHeight:"100vh"}}>Chargement...</div>;

  // Écran de fin
  if(state.task==="Terminé"){
    const history = state.history || [];
    return (
      <div style={{padding:"40px 20px",textAlign:"center",color:"#fff",minHeight:"100vh",background:"#0d0d1a",display:"flex",flexDirection:"column",alignItems:"center",gap:24}}>
        <div style={{fontSize:56}}>🎉</div>
        <h1 style={{color:"#00f5d4",margin:0}}>Session terminée !</h1>
        <p style={{color:"#888",fontSize:14,margin:0}}>Toutes les tâches ont été estimées.</p>

        {history.length>0 && (
          <div style={{width:"100%",maxWidth:700,marginTop:8}}>
            <h2 style={{color:"#fff",fontSize:16,marginBottom:12,textAlign:"left"}}>📋 Récapitulatif des estimations</h2>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",padding:"10px 16px",background:"#1a1a2e",color:"#00f5d4",borderRadius:"8px 0 0 0",borderBottom:"2px solid #00f5d433"}}>Tâche</th>
                  <th style={{textAlign:"center",padding:"10px 16px",background:"#1a1a2e",color:"#00f5d4",borderBottom:"2px solid #00f5d433"}}>Votes</th>
                  <th style={{textAlign:"center",padding:"10px 16px",background:"#1a1a2e",color:"#00f5d4",borderRadius:"0 8px 0 0",borderBottom:"2px solid #00f5d433"}}>Médiane</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h,i)=>(
                  <tr key={i} style={{background:i%2===0?"#111":"#0d0d1a"}}>
                    <td style={{textAlign:"left",padding:"12px 16px",color:"#ddd",maxWidth:300}}>{h.task}</td>
                    <td style={{textAlign:"center",padding:"12px 16px",color:"#888",fontSize:12}}>
                      {h.votes.map((v,j)=>(
                        <span key={j} style={{display:"inline-block",background:"#1a1a2e",border:"1px solid #333",borderRadius:4,padding:"2px 7px",margin:"1px 2px",color:v.vote!=null?"#ccc":"#444"}}>
                          {v.name} : <strong style={{color:v.vote!=null?"#00f5d4":"#444"}}>{v.vote!=null?v.vote:"—"}</strong>
                        </span>
                      ))}
                    </td>
                    <td style={{textAlign:"center",padding:"12px 16px"}}>
                      {h.median!=null
                        ? <span style={{display:"inline-block",background:"#00f5d4",color:"#0d0d1a",borderRadius:8,padding:"4px 16px",fontWeight:"bold",fontSize:20}}>{h.median}</span>
                        : <span style={{color:"#555"}}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={()=>window.location.href="/"}
          style={{marginTop:8,padding:"12px 28px",background:"#00f5d4",border:"none",borderRadius:8,fontWeight:"bold",fontSize:15,cursor:"pointer"}}>
          ← Nouvelle session
        </button>
      </div>
    );
  }

  const vote=(v)=>{
    socket.emit("vote",{id,value:v});
    setSelected(v);
  };
  const reveal=()=> socket.emit("reveal",{id});
  const next=()=>{ socket.emit("next",{id}); setSelected(null); };

  const canNext = state.revealed;

  const totalVotes=state.participants.filter(p=>p.vote!=null).length;
  const totalParticipants=state.participants.length;

  return (
    <div style={{padding:"40px 20px",textAlign:"center",color:"#fff",minHeight:"100vh",background:"#0d0d1a",position:"relative"}}>

      {/* Timer badge for everyone */}
      <TimerBadge seconds={state.timerSeconds}/>

      {/* Timer control panel only for host */}
      {isHost && <TimerPanel id={id} timerSeconds={state.timerSeconds}/>}

      <h1 style={{color:"#00f5d4",marginBottom:4,marginTop:0}}>{state.task}</h1>
      <p style={{color:"#666",fontSize:13,marginBottom:24}}>
        {totalVotes}/{totalParticipants} vote{totalParticipants>1?"s":""}
      </p>

      {/* Participants cards */}
      <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:24,margin:"0 auto 32px",maxWidth:800,perspective:1000}}>
        {state.participants.map(p=>{
          const hasVoted=p.vote!=null;
          return (
            <div key={p.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <div style={{
                width:90,height:130,
                position:"relative",
                transformStyle:"preserve-3d",
                transition:"transform 0.6s cubic-bezier(0.4,0.2,0.2,1)",
                transform: state.revealed ? "rotateY(180deg)" : "rotateY(0deg)"
              }}>
                {/* Front */}
                <div style={{
                  position:"absolute",inset:0,
                  backfaceVisibility:"hidden",
                  WebkitBackfaceVisibility:"hidden",
                  background: hasVoted ? "#0d2a1e" : "#1a1a2e",
                  border: hasVoted ? "2px solid #00f5d4" : "2px solid #333",
                  borderRadius:12,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:34,
                  transition:"border-color 0.3s, background 0.3s"
                }}>
                  {hasVoted ? "✅" : "🂠"}
                </div>
                {/* Back (revealed) */}
                <div style={{
                  position:"absolute",inset:0,
                  backfaceVisibility:"hidden",
                  WebkitBackfaceVisibility:"hidden",
                  transform:"rotateY(180deg)",
                  background:"#00f5d4",
                  borderRadius:12,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexDirection:"column",
                  gap:4
                }}>
                  <span style={{fontSize:40,fontWeight:"bold",color:"#0d0d1a",lineHeight:1}}>
                    {hasVoted ? String(p.vote) : "—"}
                  </span>
                </div>
              </div>
              {/* Name always readable — outside the flipping element */}
              <span style={{fontSize:13,color:"#bbb",fontWeight:500,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {p.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Voting area */}
      {!state.revealed && (
        <div>
          <p style={{color:"#666",fontSize:13,marginBottom:12}}>Choisissez votre estimation :</p>
          <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:12}}>
            {cards.map(c=>{
              const isSel=selected===c;
              return (
                <div key={c}
                  onClick={()=>vote(c)}
                  style={{
                    width:70,height:100,
                    background: isSel ? "#00f5d4" : "#111",
                    border: isSel ? "2px solid #00f5d4" : "2px solid #333",
                    borderRadius:10,
                    display:"flex",justifyContent:"center",alignItems:"center",
                    fontSize: isSel ? 30 : 22,
                    fontWeight: isSel ? "bold" : "normal",
                    color: isSel ? "#0d0d1a" : "#fff",
                    cursor:"pointer",
                    transform: isSel ? "scale(1.18) translateY(-8px)" : "scale(1)",
                    transition:"all 0.18s ease",
                    boxShadow: isSel ? "0 0 20px #00f5d488" : "none",
                    userSelect:"none"
                  }}>
                  {c}
                </div>
              );
            })}
          </div>
          {selected!=null && (
            <div style={{marginTop:16,fontSize:14,color:"#00f5d4",fontWeight:600}}>
              ✅ Tu as voté : <strong style={{fontSize:16}}>{selected}</strong>
            </div>
          )}
        </div>
      )}

      {state.revealed && (
        <div style={{marginTop:8,color:"#888",fontSize:14}}>
          Cartes révélées — les résultats sont affichés
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <div style={{marginTop:32,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{display:"flex",gap:12}}>
            <button onClick={reveal}
              disabled={state.revealed}
              style={{
                padding:"10px 22px",
                background:state.revealed?"#2a2a2a":"#e040fb",
                color:state.revealed?"#666":"#fff",
                border:"none",borderRadius:8,
                cursor:state.revealed?"default":"pointer",
                fontWeight:"bold",fontSize:14
              }}>
              🃏 Révéler les cartes
            </button>
            <button onClick={next}
              disabled={!canNext}
              style={{padding:"10px 22px",background:canNext?"#333":"#1a1a1a",color:canNext?"#fff":"#444",border:canNext?"1px solid #555":"1px solid #333",borderRadius:8,cursor:canNext?"pointer":"not-allowed",fontWeight:"bold",fontSize:14}}>
              ➡ Tâche suivante
            </button>
          </div>
          <div style={{marginTop:6,fontSize:12,color:"#555"}}>
            Lien d'invitation :
            <span style={{color:"#00f5d4",marginLeft:8,userSelect:"all"}}>
              {window.location.origin+"/join/"+id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
