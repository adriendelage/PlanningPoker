import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";

const fmt = (s) => {
  const neg = s < 0;
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60), sec = abs % 60;
  return `${neg ? "−" : ""}${m}:${String(sec).padStart(2, "0")}`;
};

export default function Daily() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isHost = params.get("host") === "true";
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.emit("daily:state", { id, isHost });
    socket.on("daily:state", setState);
    socket.on("daily:notfound", () => setNotFound(true));
    const onReconnect = () => socket.emit("daily:state", { id, isHost });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("daily:state", setState);
      socket.off("daily:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id, isHost]);

  const inviteUrl = `${window.location.origin}/daily/join/${id}`;
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
          <h1 style={{ fontSize: 24 }}>Daily introuvable</h1>
          <p style={{ color: "#777" }}>Il a peut-être expiré, ou le lien est incorrect.</p>
          <a href="/daily" style={{ color: "#fee440" }}>Créer un nouveau daily</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Connexion au daily…
      </div>
    );
  }

  const current = state.participants[state.currentIndex];
  const overtime = state.remaining < 0;
  const canNext = state.isHost || (current && current.isMe);
  const isLast = state.currentIndex >= state.participants.length - 1;
  const totalUsed = state.participants.reduce((a, p) => a + p.seconds, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            ⏱️ {state.name || "Daily stand-up"}
          </h1>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>
            {fmt(state.secondsPerPerson)} / personne
          </span>
        </header>

        {/* ─── LOBBY ─── */}
        {state.phase === "lobby" && (
          <>
            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Inviter l'équipe :</div>
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, background: "#1a1a2e", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#fee440", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inviteUrl}
                </code>
                <button onClick={copy}
                  style={{ padding: "0 16px", background: copied ? "#00f5d4" : "#fee440", border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 13 }}>
                  {copied ? "✓ Copié" : "Copier"}
                </button>
              </div>
            </div>

            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "#aaa" }}>
                Ordre de passage ({state.participants.length})
              </h2>
              {state.participants.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1a2e", fontSize: 15 }}>
                  <span style={{ color: "#555", fontSize: 13, width: 20 }}>{i + 1}.</span>
                  <span style={{ color: p.isMe ? "#fee440" : "#ddd", fontWeight: p.isMe ? 700 : 400 }}>
                    {p.name}{p.isMe ? " (toi)" : ""}
                  </span>
                </div>
              ))}
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#555" }}>
                L'ordre de passage suit l'ordre d'arrivée dans le lobby.
              </p>
            </div>

            {state.isHost && (
              <button onClick={() => socket.emit("daily:start", { id })}
                disabled={state.participants.length < 2}
                style={{
                  width: "100%", padding: 16,
                  background: state.participants.length < 2 ? "#333" : "#fee440",
                  border: "none", borderRadius: 10, fontWeight: "bold",
                  cursor: state.participants.length < 2 ? "not-allowed" : "pointer",
                  fontSize: 17, color: state.participants.length < 2 ? "#666" : "#0d0d1a"
                }}>
                {state.participants.length < 2 ? "En attente de l'équipe…" : "Démarrer le daily →"}
              </button>
            )}
          </>
        )}

        {/* ─── EN COURS ─── */}
        {state.phase === "running" && current && (
          <>
            <div style={{
              background: "#111",
              border: `2px solid ${overtime ? "#ff4444" : "#fee440"}`,
              borderRadius: 18, padding: "34px 24px", textAlign: "center",
              marginBottom: 22,
              boxShadow: overtime ? "0 0 24px #ff444433" : "0 0 24px #fee44022",
              transition: "border-color .3s, box-shadow .3s",
            }}>
              <div style={{ fontSize: 14, color: "#888", marginBottom: 6 }}>
                Au micro ({state.currentIndex + 1}/{state.participants.length})
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 14 }}>
                🎤 {current.name}{current.isMe ? " — à toi !" : ""}
              </div>
              <div style={{
                fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                letterSpacing: 2, color: overtime ? "#ff4444" : "#fee440",
              }}>
                {fmt(state.remaining)}
              </div>
              {overtime && <div style={{ marginTop: 6, color: "#ff4444", fontSize: 14, fontWeight: 600 }}>Dépassement !</div>}

              {canNext && (
                <button onClick={() => socket.emit("daily:next", { id })}
                  style={{ marginTop: 22, padding: "14px 28px", background: isLast ? "#00f5d4" : "#fee440", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 16, color: "#0d0d1a" }}>
                  {isLast ? "Terminer le daily ✓" : "Speaker suivant →"}
                </button>
              )}
            </div>

            <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "14px 20px" }}>
              {state.participants.map((p, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid #1a1a2e", fontSize: 14.5,
                  opacity: p.done ? .5 : 1,
                }}>
                  <span style={{ width: 22 }}>{p.done ? "✅" : i === state.currentIndex ? "🎤" : "⏳"}</span>
                  <span style={{ flex: 1, color: "#ddd" }}>{p.name}{p.isMe ? " (toi)" : ""}</span>
                  <span style={{ color: p.seconds > state.secondsPerPerson ? "#ff4444" : "#666", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(p.seconds)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─── BILAN ─── */}
        {state.phase === "done" && (
          <div style={{ background: "#111", border: "1px solid #00f5d433", borderRadius: 14, padding: "22px 24px" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#00f5d4" }}>✅ Daily terminé</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "#666" }}>
              Durée totale : <strong style={{ color: "#aaa" }}>{fmt(totalUsed)}</strong>
            </p>
            {state.participants.map((p, i) => {
              const over = p.seconds > state.secondsPerPerson;
              return (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a1a2e", fontSize: 15 }}>
                  <span style={{ flex: 1, color: "#ddd" }}>{p.name}</span>
                  <span style={{ color: over ? "#ff4444" : "#00f5d4", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(p.seconds)}{over ? ` (+${fmt(p.seconds - state.secondsPerPerson)})` : ""}
                  </span>
                </div>
              );
            })}
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#555" }}>
              Les temps sont enregistrés — retrouve-les dans « Sessions récentes » sur la page d'accueil.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
