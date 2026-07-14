import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { itemsApi } from "../itemsApi";
import { useDocumentMeta } from "../useDocumentMeta";

const ACCENT = "#e63946";  // courbe réelle
const IDEAL_COLOR = "#555"; // ligne idéale, en pointillé discret

// ─── Graphique en courbes (SVG fait main, même famille que Vélocité/Pouls) ──
function BurndownChart({ days, totalPoints }) {
  const W = 640, H = 280;
  const padL = 40, padR = 16, padT = 16, padB = 36;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxVal = Math.max(1, totalPoints);
  const stepX = days.length > 1 ? chartW / (days.length - 1) : 0;
  const yOf = v => padT + chartH - (v / maxVal) * chartH;

  const realPoints = days.map((d, i) => ({ x: padL + i * stepX, y: yOf(d.remaining) }));
  const idealPoints = days.map((d, i) => ({ x: padL + i * stepX, y: yOf(d.ideal) }));
  const pathOf = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const tickEvery = Math.max(1, Math.ceil(days.length / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} x2={W - padR} y1={padT + chartH * (1 - f)} y2={padT + chartH * (1 - f)} stroke="#1c1c30" strokeWidth="1" />
      ))}

      <path d={pathOf(idealPoints)} fill="none" stroke={IDEAL_COLOR} strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={pathOf(realPoints)} fill="none" stroke={ACCENT} strokeWidth="2.5" />
      {realPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={ACCENT} stroke="#0d0d1a" strokeWidth="1" />
      ))}

      {days.map((d, i) => (i % tickEvery === 0 || i === days.length - 1) && (
        <text key={i} x={padL + i * stepX} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#666">
          {d.date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

export default function SprintBurndown() {
  const { orgSlug, sprintId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useDocumentMeta("Burndown de sprint", "Suivi visuel de l'avancement d'un sprint : points restants réels vs ligne idéale, jour après jour.");

  useEffect(() => {
    itemsApi.burndown(orgSlug, sprintId).then(setData).catch(e => setError(e.message));
  }, [orgSlug, sprintId]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 16 }}>
        <div>
          <div style={{ fontSize: 44 }}>🚫</div>
          <p style={{ color: "#ff8888" }}>{error}</p>
          <a href={`/app/${orgSlug}/board`} style={{ color: ACCENT }}>← Retour au tableau</a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Calcul du burndown…
      </div>
    );
  }

  const lastDay = data.days[data.days.length - 1];
  const onTrack = lastDay && lastDay.remaining <= lastDay.ideal + 0.5; // petite tolérance d'arrondi

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#fff", padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <a href={`/app/${orgSlug}/board`} style={{ color: "#666", fontSize: 14, textDecoration: "none" }}>← Retour au tableau</a>

        <h1 style={{ margin: "16px 0 4px", fontSize: 24, fontWeight: 700 }}>📉 {data.sprintName}</h1>
        <p style={{ margin: "0 0 22px", fontSize: 13, color: "#666" }}>
          {data.startDate?.slice(0, 10)} → {data.endDate?.slice(0, 10)} · {data.totalPoints} points au total
        </p>

        {data.days.length > 0 ? (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "18px 16px", marginBottom: 20 }}>
            <BurndownChart days={data.days} totalPoints={data.totalPoints} />
            <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 10, fontSize: 12.5, color: "#888" }}>
              <span><span style={{ display: "inline-block", width: 14, height: 2, background: ACCENT, marginRight: 6, verticalAlign: "middle" }} />Restant réel</span>
              <span><span style={{ display: "inline-block", width: 14, height: 2, background: IDEAL_COLOR, marginRight: 6, verticalAlign: "middle", borderTop: `2px dashed ${IDEAL_COLOR}` }} />Ligne idéale</span>
            </div>
          </div>
        ) : (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 14, padding: "32px 16px", textAlign: "center", color: "#555" }}>
            Pas encore de données pour ce sprint.
          </div>
        )}

        {lastDay && (
          <div style={{
            background: "#111", border: `1px solid ${onTrack ? "#00f5d444" : "#ff444444"}`, borderRadius: 14,
            padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
          }}>
            <span style={{ fontSize: 24 }}>{onTrack ? "✅" : "⚠️"}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: onTrack ? "#00f5d4" : "#ff8888" }}>
                {onTrack ? "Dans les temps" : "En retard sur la ligne idéale"}
              </div>
              <div style={{ fontSize: 12.5, color: "#666" }}>
                {lastDay.remaining} points restants au {lastDay.date.slice(5)} (idéal : {lastDay.ideal})
              </div>
            </div>
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: "#444" }}>
          Reconstruit automatiquement à partir de l'historique des changements
          de statut des items de ce sprint — pas de saisie manuelle quotidienne nécessaire.
        </p>

      </div>
    </div>
  );
}
