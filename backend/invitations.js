// ═══ Acceptation d'invitation ═════════════════════════════════════════════════
// Séparé de members.js à dessein : ces routes sont identifiées par le
// TOKEN de l'invitation, pas par un slug d'organisation dont l'appelant
// serait déjà membre — c'est justement l'inverse ici (l'utilisateur qui
// accepte n'est PAS encore membre). Donc protégées par requireAuth
// seulement, jamais par requireOrgMember.

const express = require("express");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router();
router.use(requireAuth);

router.get("/:token", async (req, res) => {
  try {
    const inv = await db.invitationFindByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: "Invitation introuvable." });

    const expired = new Date(inv.expires_at) < new Date();
    const alreadyAccepted = !!inv.accepted_at;
    // On indique si l'email connecté correspond à celui invité, mais on
    // laisse le frontend décider quoi en faire — le blocage réel se fait
    // à l'acceptation (voir plus bas), pas ici.
    const emailMatches = req.authUser.email.toLowerCase() === inv.email.toLowerCase();

    res.json({
      orgName: inv.org_name,
      orgSlug: inv.org_slug,
      role: inv.role,
      email: inv.email,
      expired,
      alreadyAccepted,
      emailMatches,
    });
  } catch (e) {
    console.error("Erreur GET /invitations/:token:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/:token/accept", async (req, res) => {
  try {
    const inv = await db.invitationFindByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: "Invitation introuvable." });

    if (inv.accepted_at) return res.status(410).json({ error: "Cette invitation a déjà été utilisée." });
    if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: "Cette invitation a expiré." });

    // Empêche qu'un lien d'invitation, une fois connu, permette à
    // N'IMPORTE QUEL compte de rejoindre l'organisation — seul le
    // titulaire de l'adresse email invitée peut l'accepter.
    if (req.authUser.email.toLowerCase() !== inv.email.toLowerCase()) {
      return res.status(403).json({ error: "Cette invitation est destinée à une autre adresse email." });
    }

    await db.invitationAccept(inv.id, req.authUser.sub, inv.org_id, inv.role);
    res.json({ orgSlug: inv.org_slug, role: inv.role });
  } catch (e) {
    console.error("Erreur POST /invitations/:token/accept:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = { router };
