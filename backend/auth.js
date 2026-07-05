// ═══ Espace de travail connecté — authentification ═══════════════════════════
// Module complètement séparé du reste du serveur : aucun outil en mode
// "lien" (Poker, Kanban, etc.) ne dépend de ce fichier, et inversement.
//
// Choix de sécurité :
// - Mots de passe hashés avec bcryptjs (implémentation pure JS, pas de
//   compilation native — plus sûr à déployer sur Railway sans mauvaise
//   surprise de toolchain que le paquet `bcrypt` natif).
// - Jetons JWT signés (pas de session stockée côté serveur pour l'instant),
//   envoyés dans l'en-tête Authorization: Bearer <token>, jamais en cookie
//   — évite toute la complexité des cookies cross-domain (Netlify → Railway)
//   et de leurs réglages SameSite/Secure.
// - Le login compare TOUJOURS un hash, même si l'email n'existe pas
//   (hash factice), pour qu'un attaquant ne puisse pas déduire de la durée
//   de réponse si un email est enregistré ou non.
// - Limitation de tentatives de connexion (express-rate-limit) par IP.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
const TOKEN_EXPIRY = "7d";
// Hash bcrypt valide mais dont aucun mot de passe ne correspondra jamais —
// utilisé pour comparer même quand l'utilisateur n'existe pas (voir plus haut).
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Dp1MQ.pFmY9EEZLwR3lg7g1c3Vc3G";

if (JWT_SECRET === "dev-only-insecure-secret-change-me") {
  console.warn(
    "⚠️  JWT_SECRET n'est pas défini — un secret de développement non sécurisé est utilisé. " +
    "Définis la variable d'environnement JWT_SECRET sur Railway avant toute utilisation réelle."
  );
}

function slugify(str) {
  return (
    String(str || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire les accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 50) || "equipe"
  );
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// Toutes les routes d'auth exigent une base de données — un système de
// comptes ne peut pas fonctionner en mode mémoire comme les autres outils.
function requireDb(req, res, next) {
  if (!db.enabled()) {
    return res.status(503).json({ error: "Espace de travail indisponible : la base de données n'est pas configurée." });
  }
  next();
}
router.use(requireDb);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 tentatives / IP / fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de connexion. Réessaie dans quelques minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20,                  // 20 inscriptions / IP / heure — anti-spam basique
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop d'inscriptions depuis cette adresse. Réessaie plus tard." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
    const password = String(req.body?.password || "");
    const orgName = String(req.body?.orgName || "").trim().slice(0, 100) || `Équipe de ${name || "l'utilisateur"}`;

    if (!name) return res.status(400).json({ error: "Le nom est requis." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Adresse email invalide." });
    if (password.length < 8) return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères." });

    const existing = await db.authFindUserByEmail(email);
    if (existing) return res.status(409).json({ error: "Un compte existe déjà avec cet email." });

    const passwordHash = await bcrypt.hash(password, 12);
    const { user, org } = await db.authRegister(name, email, passwordHash, orgName, slugify(orgName));

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      orgs: [{ id: org.id, name: org.name, slug: org.slug, role: "owner" }],
    });
  } catch (e) {
    console.error("Erreur /auth/register:", e.message);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await db.authFindUserByEmail(email);
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    }

    const orgs = await db.authGetUserOrgs(user.id);
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email }, orgs });
  } catch (e) {
    console.error("Erreur /auth/login:", e.message);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard." });
  }
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifié." });
  try {
    req.authUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expirée — reconnecte-toi." });
  }
}

router.get("/me", requireAuth, async (req, res) => {
  try {
    const orgs = await db.authGetUserOrgs(req.authUser.sub);
    res.json({
      user: { id: req.authUser.sub, name: req.authUser.name, email: req.authUser.email },
      orgs,
    });
  } catch (e) {
    console.error("Erreur /auth/me:", e.message);
    res.status(500).json({ error: "Erreur serveur — réessaie plus tard." });
  }
});

module.exports = { router, requireAuth };
