// ═══ Espace de travail connecté — membres & invitations (étape 4) ════════════
// Rôles : owner > admin > member. Pas d'envoi d'email réel (aucun service
// comme SendGrid configuré dans ce projet) — une invitation génère un lien
// à copier/partager manuellement, pas un email automatique. C'est un choix
// pragmatique documenté, pas un oubli : ajouter un vrai envoi d'email
// demanderait une dépendance à un service externe supplémentaire.

const crypto = require("crypto");
const express = require("express");
const db = require("./db");
const { requireOrgMember } = require("./items");

const router = express.Router({ mergeParams: true });
router.use(requireOrgMember); // requireAuth est déjà appliqué à l'intérieur

const VALID_ROLES = ["owner", "admin", "member"];
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours, comme l'expiration du JWT

// admin ET owner peuvent inviter ; seul owner peut gérer les rôles/retraits
// et inviter avec le rôle "owner" — évite qu'un admin puisse se hisser
// lui-même (ou hisser un complice) au rang de propriétaire.
function requireOrgAdmin(req, res, next) {
  if (req.membership.role !== "owner" && req.membership.role !== "admin") {
    return res.status(403).json({ error: "Seuls les propriétaires et administrateurs peuvent faire ça." });
  }
  next();
}
function requireOrgOwner(req, res, next) {
  if (req.membership.role !== "owner") {
    return res.status(403).json({ error: "Seul le propriétaire de l'organisation peut faire ça." });
  }
  next();
}

// ── Membres ──────────────────────────────────────────────────────────────────

router.get("/members", async (req, res) => {
  try {
    const members = await db.membersList(req.org.id);
    res.json(members);
  } catch (e) {
    console.error("Erreur GET /members:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/members/:userId", requireOrgOwner, async (req, res) => {
  try {
    const role = req.body?.role;
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide." });

    const result = await db.memberUpdateRole(req.org.id, req.params.userId, role);
    if (result.error === "NOT_FOUND") return res.status(404).json({ error: "Membre introuvable." });
    if (result.error === "LAST_OWNER") {
      return res.status(400).json({ error: "Impossible de rétrograder le dernier propriétaire de l'organisation." });
    }
    res.json({ role: result.role });
  } catch (e) {
    console.error("Erreur PATCH /members/:userId:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/members/:userId", requireOrgOwner, async (req, res) => {
  try {
    const result = await db.memberRemove(req.org.id, req.params.userId);
    if (result.error === "NOT_FOUND") return res.status(404).json({ error: "Membre introuvable." });
    if (result.error === "LAST_OWNER") {
      return res.status(400).json({ error: "Impossible de retirer le dernier propriétaire de l'organisation." });
    }
    res.status(204).end();
  } catch (e) {
    console.error("Erreur DELETE /members/:userId:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Invitations (création, côté organisation) ────────────────────────────────

router.post("/invitations", requireOrgAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = req.body?.role || "member";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Adresse email invalide." });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: "Rôle invalide." });
    if (role === "owner" && req.membership.role !== "owner") {
      return res.status(403).json({ error: "Seul le propriétaire peut inviter avec le rôle propriétaire." });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await db.invitationCreate(req.org.id, email, role, req.authUser.sub, token, expiresAt);

    res.status(201).json({ token: invitation.token, email: invitation.email, role: invitation.role, expiresAt: invitation.expires_at });
  } catch (e) {
    console.error("Erreur POST /invitations:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = { router };
