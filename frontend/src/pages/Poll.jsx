import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";

const ACCENT = "#118ab2";

export default function Poll() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isHost = params.get("host") === "true";
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.emit("poll:state", { id, isHost });
    socket.on("poll:state", setState);
    socket.on("poll:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("poll:state", { id, isHost });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("poll:state", setState);
      socket.off("poll:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id, isHost]);

  const vote = (i) => socket.emit("poll:vote", { id, optionIndex: i });
  const close = () => socket.emit("poll:close", { id });
  const inviteUrl = `${window.location.origin}/poll/${id}`;
  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 52 }}>🫥</div>
          <h1 style={{ fontSize: 24 }}>Sondage introuvable</h1>
          <p style={{ color: "#777" }}>Il a peut-être expiré, ou le lien est incorrect.</p>
          <a href="/poll" style={{ color: ACCENT }}>Créer un nouveau sondage</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Connexion au sondage…
      </div>
    );
  }

  const totalVotes = state.options.reduce((s, o) => s + o.votes, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          {state.closed && (
            <span style={{ fontSize: 12, color: "#00f5d4", border: "1px solid #00f5d444", borderRadius: 999, padding: "3px 10px" }}>
              Clôturé
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>👥 {state.participants}</span>
        </header>

        <h1 style={{ margin: "8px 0 24px", fontSize: 24, fontWeight: 700 }}>🗳️ {state.question}</h1>

        {!state.closed && !isHost && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#888" }}>
            Clique sur une option pour voter — tu peux changer d'avis tant que le sondage n'est pas clôturé.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {state.options.map((o, i) => {
            const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
            const mine = state.myVote === i;
            return (
              <div key={i}
                onClick={() => !state.closed && vote(i)}
                style={{
                  position: "relative", background: "#111",
                  border: `1px solid ${mine ? ACCENT : "#222"}`,
                  borderRadius: 12, padding: "14px 16px", overflow: "hidden",
                  cursor: state.closed ? "default" : "pointer",
                }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
                  background: mine ? `${ACCENT}33` : "#1a1a2e", transition: "width .3s ease", zIndex: 0,
                }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
                  <span style={{ fontSize: 15, color: mine ? "#fff" : "#ddd", fontWeight: mine ? 700 : 400 }}>
                    {mine && "✓ "}{o.text}
                  </span>
                  <span style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>{o.votes} ({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>{totalVotes} vote{totalVotes !== 1 ? "s" : ""} au total</p>

        {isHost && !state.closed && (
          <>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Inviter l'équipe :</div>
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, background: "#1a1a2e", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inviteUrl}
                </code>
                <button onClick={copy}
                  style={{ padding: "0 16px", background: copied ? "#00f5d4" : ACCENT, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#fff", fontSize: 13 }}>
                  {copied ? "✓ Copié" : "Copier"}
                </button>
              </div>
            </div>
            <button onClick={close}
              style={{ width: "100%", padding: 14, background: "#00f5d4", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 15, color: "#0d0d1a" }}>
              Clôturer le sondage ✓
            </button>
          </>
        )}

      </div>
    </div>
  );
}
