// ═══ Espace de travail connecté — items & sprints (étape 2) ══════════════════
// Le coeur du rapprochement avec Jira : une table `items` partagée par
// organisation, que le tableau connecté lit/écrit, au lieu des tables
// isolées par outil du mode lien (kanban_cards, gantt_tasks, ...).
//
// Toutes les routes sont protégées par requireAuth (voir auth.js) PUIS par
// requireOrgMember ci-dessous : on vérifie que l'utilisateur authentifié
// est bien membre de l'organisation visée par l'URL (:orgSlug), pas
// seulement qu'il a un jeton valide pour N'IMPORTE QUELLE organisation.

const express = require("express");
const db = require("./db");
const { requireAuth } = require("./auth");

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

// Statuts de carte (colonnes du tableau). L'appartenance à un sprint est un
// concept séparé (sprint_id nullable) : un item sans sprint est "au backlog",
// quel que soit son statut — ce n'est pas un 4e statut, sinon les deux
// notions se chevauchent de façon confuse.
const VALID_STATUSES = ["todo", "in_progress", "done"];

async function requireOrgMember(req, res, next) {
  try {
    const org = await db.orgFindBySlug(req.params.orgSlug);
    if (!org) return res.status(404).json({ error: "Organisation introuvable." });
    const membership = await db.orgCheckMembership(req.authUser.sub, org.id);
    if (!membership) return res.status(403).json({ error: "Tu n'es pas membre de cette organisation." });
    req.org = org;
    req.membership = membership;
    next();
  } catch (e) {
    console.error("Erreur requireOrgMember:", e.message);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard." });
  }
}
router.use(requireOrgMember);

// ── Sprints ──────────────────────────────────────────────────────────────────

router.get("/sprints", async (req, res) => {
  try {
    const sprints = await db.sprintsList(req.org.id);
    res.json(sprints);
  } catch (e) {
    console.error("Erreur GET /sprints:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/sprints", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 100);
    const goal = String(req.body?.goal || "").trim().slice(0, 300) || null;
    if (!name) return res.status(400).json({ error: "Le nom du sprint est requis." });
    const sprint = await db.sprintCreate(req.org.id, {
      name, goal,
      startDate: req.body?.startDate || null,
      endDate: req.body?.endDate || null,
    });
    res.status(201).json(sprint);
  } catch (e) {
    console.error("Erreur POST /sprints:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Vélocité (calculée depuis les items, pas ressaisie) ──────────────────────

router.get("/velocity", async (req, res) => {
  try {
    const data = await db.velocityBySprintForOrg(req.org.id);
    res.json(data);
  } catch (e) {
    console.error("Erreur GET /velocity:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Items ────────────────────────────────────────────────────────────────────

router.get("/items", async (req, res) => {
  try {
    const items = await db.itemsList(req.org.id, req.query.sprint);
    res.json(items);
  } catch (e) {
    console.error("Erreur GET /items:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/items", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: "Le titre est requis." });
    const status = VALID_STATUSES.includes(req.body?.status) ? req.body.status : "todo";
    const storyPoints = req.body?.storyPoints != null
      ? Math.max(0, Math.min(999, parseInt(req.body.storyPoints) || 0))
      : null;

    const item = await db.itemCreate(req.org.id, {
      title,
      description: String(req.body?.description || "").trim().slice(0, 2000),
      status,
      assignee: req.body?.assignee ? String(req.body.assignee).trim().slice(0, 60) : null,
      storyPoints,
      sprintId: req.body?.sprintId || null,
    }, req.authUser.sub);

    await db.itemActivityLog(item.id, req.authUser.sub, "created", { title });
    res.status(201).json(item);
  } catch (e) {
    console.error("Erreur POST /items:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.patch("/items/:itemId", async (req, res) => {
  try {
    const before = await db.itemGetById(req.params.itemId, req.org.id);
    if (!before) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    const fields = {};
    if (req.body?.title != null) fields.title = String(req.body.title).trim().slice(0, 200);
    if (req.body?.description != null) fields.description = String(req.body.description).trim().slice(0, 2000);
    if (req.body?.status != null) {
      if (!VALID_STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Statut invalide." });
      fields.status = req.body.status;
    }
    if (req.body?.assignee !== undefined) fields.assignee = req.body.assignee ? String(req.body.assignee).trim().slice(0, 60) : null;
    if (req.body?.storyPoints !== undefined) {
      fields.story_points = req.body.storyPoints != null
        ? Math.max(0, Math.min(999, parseInt(req.body.storyPoints) || 0))
        : null;
    }
    if (req.body?.sprintId !== undefined) fields.sprint_id = req.body.sprintId || null;
    if (req.body?.position != null) fields.position = parseInt(req.body.position) || 0;

    const item = await db.itemUpdate(req.params.itemId, req.org.id, fields);
    if (!item) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    // Journalisation : un événement dédié pour le changement de statut
    // (le plus significatif pour l'historique visible), un événement
    // générique pour le reste.
    if (fields.status && fields.status !== before.status) {
      await db.itemActivityLog(item.id, req.authUser.sub, "status_changed", { from: before.status, to: fields.status });
    }
    const otherFields = Object.keys(fields).filter(k => k !== "status" && k !== "position");
    if (otherFields.length > 0) {
      await db.itemActivityLog(item.id, req.authUser.sub, "updated", { fields: otherFields });
    }

    res.json(item);
  } catch (e) {
    console.error("Erreur PATCH /items/:itemId:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/items/:itemId", async (req, res) => {
  try {
    const deleted = await db.itemDelete(req.params.itemId, req.org.id);
    if (!deleted) return res.status(404).json({ error: "Item introuvable dans cette organisation." });
    res.status(204).end();
  } catch (e) {
    console.error("Erreur DELETE /items/:itemId:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Étape 3 : fiche détail (commentaires, activité, dépendances) ────────────
// Une seule route renvoie tout ce dont la fiche a besoin en un appel :
// l'item, ses commentaires, son historique, ses dépendances, et la liste
// des autres items de l'organisation (candidats pour une nouvelle dépendance).

router.get("/items/:itemId/detail", async (req, res) => {
  try {
    const item = await db.itemGetById(req.params.itemId, req.org.id);
    if (!item) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    const [comments, activity, dependencies, allItems] = await Promise.all([
      db.itemCommentsList(item.id),
      db.itemActivityList(item.id),
      db.itemDependenciesList(item.id),
      db.itemsList(req.org.id),
    ]);

    res.json({
      item,
      comments,
      activity,
      dependencies,
      candidates: allItems.filter(i => i.id !== item.id).map(i => ({ id: i.id, title: i.title, status: i.status })),
    });
  } catch (e) {
    console.error("Erreur GET /items/:itemId/detail:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/items/:itemId/comments", async (req, res) => {
  try {
    const item = await db.itemGetById(req.params.itemId, req.org.id);
    if (!item) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    const body = String(req.body?.body || "").trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: "Le commentaire ne peut pas être vide." });

    const comment = await db.itemCommentAdd(item.id, req.authUser.sub, body);
    await db.itemActivityLog(item.id, req.authUser.sub, "comment_added", {});
    res.status(201).json(comment);
  } catch (e) {
    console.error("Erreur POST /items/:itemId/comments:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.post("/items/:itemId/dependencies", async (req, res) => {
  try {
    const item = await db.itemGetById(req.params.itemId, req.org.id);
    if (!item) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    const dependsOnId = parseInt(req.body?.dependsOnId);
    if (!dependsOnId || dependsOnId === item.id) {
      return res.status(400).json({ error: "Dépendance invalide." });
    }

    const added = await db.itemDependencyAdd(item.id, dependsOnId, req.org.id);
    if (!added) {
      return res.status(400).json({ error: "Impossible d'ajouter cette dépendance (item introuvable dans cette organisation, ou déjà présente)." });
    }
    await db.itemActivityLog(item.id, req.authUser.sub, "dependency_added", { dependsOnId });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("Erreur POST /items/:itemId/dependencies:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

router.delete("/items/:itemId/dependencies/:depId", async (req, res) => {
  try {
    const item = await db.itemGetById(req.params.itemId, req.org.id);
    if (!item) return res.status(404).json({ error: "Item introuvable dans cette organisation." });

    await db.itemDependencyRemove(item.id, req.params.depId);
    await db.itemActivityLog(item.id, req.authUser.sub, "dependency_removed", { dependsOnId: Number(req.params.depId) });
    res.status(204).end();
  } catch (e) {
    console.error("Erreur DELETE /items/:itemId/dependencies/:depId:", e.message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = { router, requireOrgMember };
