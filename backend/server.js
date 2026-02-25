const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const cors=require("cors");

const app=express();
app.use(cors());
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});

let sessions={};
let timers={}; // intervalIds par session

function broadcastState(id){
  const s=sessions[id];
  if(!s) return;
  io.to(id).emit("state",{
    task: s.tasks[s.index] || "Terminé",
    participants: s.participants,
    revealed: s.revealed,
    timerSeconds: s.timerSeconds ?? null  // valeur courante du timer (null = pas de timer)
  });
}

function startTimer(id, seconds){
  const s=sessions[id];
  if(!s) return;
  // Clear previous timer if any
  if(timers[id]) clearInterval(timers[id]);
  s.timerSeconds = seconds;
  broadcastState(id);
  timers[id]=setInterval(()=>{
    if(!sessions[id]) { clearInterval(timers[id]); return; }
    sessions[id].timerSeconds--;
    broadcastState(id);
    if(sessions[id].timerSeconds<=0){
      clearInterval(timers[id]);
      delete timers[id];
      // Auto-reveal when timer hits 0
      sessions[id].revealed=true;
      sessions[id].timerSeconds=null;
      broadcastState(id);
    }
  },1000);
}

function stopTimer(id){
  if(timers[id]){ clearInterval(timers[id]); delete timers[id]; }
  if(sessions[id]) sessions[id].timerSeconds=null;
}

io.on("connection",socket=>{

  socket.on("session:create",(data,cb)=>{
    const id=Math.random().toString(36).substring(2,8);
    sessions[id]={
      tasks: data.tasks.filter(t=>t.trim()),
      index: 0,
      participants: [],
      revealed: false,
      timerSeconds: null
    };
    const hostName = data.hostName || "Hôte";
    sessions[id].participants.push({id:socket.id, name:hostName, vote:null});
    socket.join(id);
    cb(id);
    broadcastState(id);
  });

  socket.on("session:join",({id,name})=>{
    if(!sessions[id]) return;
    const exists = sessions[id].participants.find(p=>p.id===socket.id);
    if(!exists){
      sessions[id].participants.push({id:socket.id, name, vote:null});
    }
    socket.join(id);
    broadcastState(id);
  });

  // Called when navigating to /poker/:id — re-register socket in room
  // For the host: update their socket.id in participants if it changed
  socket.on("poker:state",({id, isHost})=>{
    const s=sessions[id];
    if(!s) return;
    socket.join(id);

    // If host and their old socket ID is no longer connected, update it
    if(isHost){
      // The host is always participants[0]
      const host=s.participants[0];
      if(host && host.id!==socket.id){
        host.id=socket.id;
      }
    }

    socket.emit("state",{
      task: s.tasks[s.index] || "Terminé",
      participants: s.participants,
      revealed: s.revealed,
      timerSeconds: s.timerSeconds ?? null
    });
  });

  socket.on("vote",({id,value})=>{
    const s=sessions[id];
    if(!s) return;
    const p=s.participants.find(x=>x.id===socket.id);
    if(p){ p.vote=value; broadcastState(id); }
  });

  socket.on("reveal",({id})=>{
    if(!sessions[id]) return;
    stopTimer(id);
    sessions[id].revealed=true;
    broadcastState(id);
  });

  socket.on("next",({id})=>{
    const s=sessions[id];
    if(!s) return;
    stopTimer(id);
    s.index++;
    s.revealed=false;
    s.timerSeconds=null;
    s.participants.forEach(p=>p.vote=null);
    broadcastState(id);
  });

  // Host starts a timer
  socket.on("timer:start",({id, seconds})=>{
    if(!sessions[id]) return;
    startTimer(id, seconds);
  });

  socket.on("timer:stop",({id})=>{
    if(!sessions[id]) return;
    stopTimer(id);
    broadcastState(id);
  });

  socket.on("disconnect",()=>{
    for(const id in sessions){
      // Don't remove host (index 0) on disconnect — they might reconnect
      const idx=sessions[id].participants.findIndex(p=>p.id===socket.id);
      if(idx>0){ // only remove non-host participants
        sessions[id].participants.splice(idx,1);
        broadcastState(id);
      }
    }
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", ()=>console.log(`✅ Server running on port ${PORT}`));
