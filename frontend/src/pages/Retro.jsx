import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import socket from "../socket";

const COL_COLORS = ["#00f5d4", "#f15bb5", "#fee440", "#9b5de5", "#00bbf9"];

const PHASES = {
  writing: { label: "✍️ Écriture", hint: "Ajoute tes notes — les autres ne les voient pas encore." },
  voting:  { label: "🗳️ Vote",     hint: "Tout est révélé : répartis tes votes sur les notes importantes." },
  done:    { label: "✅ Bilan",     hint: "Rétro terminée — les notes sont triées par nombre de votes." },
};

// ─── QR Code (même pattern que Poker) ────────────────────────────────────────
function QRCode({ url }) {
  const [show, setShow] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=0d0d1a&color=f15bb5&data=${encodeURIComponent(url)}`;
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setShow(s => !s)}
        style={{ background: "none", border: "1px solid #333", borderRadius: 6, color: "#555", fontSize: 12, padding: "4px 10px", cursor: "pointer" }}>
        {show ? "▲ Masquer le QR code" : "▼ Afficher le QR code"}
      </button>
      {show && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <img src={qrUrl} alt="QR Code invitation"
            style={{ borderRadius: 12, border: "2px solid #f15bb522", width: 180, height: 180 }} />
          <span style={{ fontSize: 11, color: "#444" }}>Scanner pour rejoindre</span>
        </div>
      )}
    </div>
  );
}

// ─── Une note (post-it) ──────────────────────────────────────────────────────
function Note({ note, phase, accent, votesLeft, onVote, onDelete }) {
  const masked = note.text === null;

  if (masked) {
    return (
      <div style={{
        background: "#16162a", border: "1px solid #222", borderRadius: 10,
        padding: "12px 14px", color: "#333", fontSize: 14,
        letterSpacing: 3, userSelect: "none",
      }}>
        ● ● ●
      </div>
    );
  }

  const canVote = phase === "voting" && votesLeft > 0;

  return (
    <div
      onClick={() => canVote && onVote(note.id, +1)}
      style={{
        background: note.mine ? "#1a1a2e" : "#151527",
        border: `1px solid ${note.votes > 0 && phase !== "writing" ? accent + "55" : "#2a2a44"}`,
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 14.5,
        lineHeight: 1.45,
        color: "#ddd",
        cursor: canVote ? "pointer" : "default",
        position: "relative",
        transition: "border-color .15s ease",
      }}>
      {note.text}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: note.votes > 0 || note.mine ? 10 : 0 }}>
        {/* Points de vote */}
        {phase !== "writing" && note.votes > 0 && (
          <span style={{ fontSize: 13, color: accent, fontWeight: 700 }}>
            {"●".repeat(Math.min(note.votes, 8))}{note.votes > 8 ? ` ${note.votes}` : ""}
          </span>
        )}
        {/* Retirer un de mes votes */}
        {phase === "voting" && note.myVotes > 0 && (
          <button onClick={e => { e.stopPropagation(); onVote(note.id, -1); }}
            style={{ background: "none", border: `1px solid ${accent}44`, borderRadius: 6, color: accent, fontSize: 11, padding: "1px 8px", cursor: "pointer" }}>
            − retirer ({note.myVotes})
          </button>
        )}
        {/* Supprimer sa propre note pendant l'écriture */}
        {phase === "writing" && note.mine && (
          <button onClick={e => { e.stopPropagation(); onDelete(note.id); }}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#555", fontSize: 12, cursor: "pointer" }}>
            ✕ supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Colonne ─────────────────────────────────────────────────────────────────
function Column({ name, accent, notes, phase, votesLeft, onAdd, onVote, onDelete }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    if (!draft.trim()) return;
    onAdd(name, draft);
    setDraft("");
  };

  // Tri : par votes desc en bilan, sinon ordre d'arrivée
  const sorted = phase === "done"
    ? [...notes].sort((a, b) => b.votes - a.votes)
    : notes;

  return (
    <div style={{
      background: "#111", border: "1px solid #222",
      borderTop: `3px solid ${accent}`,
      borderRadius: 14, padding: 16,
      display: "flex", flexDirection: "column", gap: 10,
      minHeight: 180,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: accent }}>{name}</h2>
        <span style={{ fontSize: 12.5, color: "#555" }}>{notes.length}</span>
      </div>

      {phase === "writing" && (
        <textarea
          placeholder="Ta note… (Entrée pour ajouter)"
          value={draft}
          rows={2}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } }}
          style={{
            width: "100%", boxSizing: "border-box", resize: "none",
            padding: "10px 12px", background: "#1a1a2e",
            border: "1px solid #333", borderRadius: 10,
            color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit",
          }} />
      )}

      {sorted.map(n => (
        <Note key={n.id} note={n} phase={phase} accent={accent}
          votesLeft={votesLeft} onVote={onVote} onDelete={onDelete} />
      ))}

      {notes.length === 0 && phase !== "writing" && (
        <p style={{ color: "#444", fontSize: 13, margin: "6px 0" }}>Aucune note dans cette colonne.</p>
      )}
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function Retro() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isHost = params.get("host") === "true";
  const [state, setState] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.emit("retro:state", { id, isHost });
    socket.on("retro:state", setState);
    socket.on("retro:notfound", () => setNotFound(true));
    // Reconnexion socket (veille mobile, coupure réseau…)
    const onReconnect = () => socket.emit("retro:state", { id, isHost });
    socket.on("connect", onReconnect);
    return () => {
      socket.off("retro:state", setState);
      socket.off("retro:notfound");
      socket.off("connect", onReconnect);
    };
  }, [id, isHost]);

  const inviteUrl = `${window.location.origin}/retro/join/${id}`;
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
          <h1 style={{ fontSize: 24 }}>Rétro introuvable</h1>
          <p style={{ color: "#777" }}>Elle a peut-être expiré, ou le lien est incorrect.</p>
          <a href="/retro" style={{ color: "#f15bb5" }}>Créer une nouvelle rétro</a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Connexion à la rétro…
      </div>
    );
  }

  const phase = PHASES[state.phase];
  const notesByCol = col => state.notes.filter(n => n.column === col);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ── En-tête ── */}
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <a href="/" style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Outils</a>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            🔄 {state.name || "Rétrospective"}
          </h1>
          <span style={{
            fontSize: 13, fontWeight: 600, color: "#f15bb5",
            border: "1px solid #f15bb544", borderRadius: 999, padding: "4px 12px",
          }}>
            {phase.label}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>
            👥 {state.participants.map(p => p.name).join(", ")}
          </span>
        </header>

        <p style={{ margin: "0 0 18px", color: "#777", fontSize: 14 }}>{phase.hint}</p>

        {/* ── Bandeau vote : compteur de votes restants ── */}
        {state.phase === "voting" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: "#111", border: "1px solid #f15bb544", borderRadius: 12,
            padding: "10px 16px", marginBottom: 18, fontSize: 14.5,
          }}>
            Tes votes restants :
            <strong style={{ color: "#f15bb5", letterSpacing: 2 }}>
              {"●".repeat(state.votesLeft)}{"○".repeat(state.maxVotes - state.votesLeft)}
            </strong>
            <span style={{ color: "#666", fontSize: 13 }}>(clique sur une note pour voter)</span>
          </div>
        )}

        {/* ── Contrôles du facilitateur ── */}
        {state.isHost && state.phase !== "done" && (
          <div style={{ marginBottom: 18 }}>
            {state.phase === "writing" && (
              <button onClick={() => socket.emit("retro:phase", { id, phase: "voting" })}
                style={{ padding: "12px 22px", background: "#f15bb5", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 15, color: "#0d0d1a" }}>
                Révéler et passer au vote →
              </button>
            )}
            {state.phase === "voting" && (
              <button onClick={() => socket.emit("retro:phase", { id, phase: "done" })}
                style={{ padding: "12px 22px", background: "#00f5d4", border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 15, color: "#0d0d1a" }}>
                Terminer la rétro ✓
              </button>
            )}
          </div>
        )}

        {/* ── Lien d'invitation (pendant l'écriture) ── */}
        {state.phase === "writing" && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "14px 16px", marginBottom: 22, maxWidth: 560 }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Inviter l'équipe :</div>
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, background: "#1a1a2e", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#f15bb5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inviteUrl}
              </code>
              <button onClick={copy}
                style={{ padding: "0 16px", background: copied ? "#00f5d4" : "#f15bb5", border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer", color: "#0d0d1a", fontSize: 13 }}>
                {copied ? "✓ Copié" : "Copier"}
              </button>
            </div>
            <QRCode url={inviteUrl} />
          </div>
        )}

        {/* ── Colonnes ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`,
          gap: 16,
          alignItems: "start",
        }}>
          {state.columns.map((col, i) => (
            <Column key={col}
              name={col}
              accent={COL_COLORS[i % COL_COLORS.length]}
              notes={notesByCol(col)}
              phase={state.phase}
              votesLeft={state.votesLeft}
              onAdd={(column, text) => socket.emit("retro:note:add", { id, column, text })}
              onVote={(noteId, delta) => socket.emit("retro:vote", { id, noteId, delta })}
              onDelete={(noteId) => socket.emit("retro:note:delete", { id, noteId })}
            />
          ))}
        </div>

        {/* ── Bilan final ── */}
        {state.phase === "done" && (
          <div style={{ marginTop: 32, background: "#111", border: "1px solid #00f5d433", borderRadius: 14, padding: "22px 24px", maxWidth: 640 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 18, color: "#00f5d4" }}>🏆 Priorités de l'équipe</h2>
            {[...state.notes].sort((a, b) => b.votes - a.votes).slice(0, 3).filter(n => n.votes > 0).map((n, i) => (
              <div key={n.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid #1a1a2e", fontSize: 15 }}>
                <span style={{ fontSize: 18 }}>{["🥇", "🥈", "🥉"][i]}</span>
                <span style={{ flex: 1, color: "#ddd" }}>{n.text}</span>
                <span style={{ color: "#f15bb5", fontWeight: 700, fontSize: 14 }}>{n.votes} vote{n.votes > 1 ? "s" : ""}</span>
              </div>
            ))}
            {state.notes.every(n => n.votes === 0) && (
              <p style={{ color: "#666", fontSize: 14, margin: 0 }}>Aucun vote n'a été exprimé.</p>
            )}
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#555" }}>
              Le bilan complet est enregistré — retrouve-le dans « Sessions récentes » sur la page d'accueil.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
