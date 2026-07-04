# 🧰 Agile Toolbox — Guide d'intégration

Extension de Planning Poker Pro : hub d'accueil multi-outils, persistance
PostgreSQL, et premier nouvel outil — la **Rétrospective**.

## Fichiers à intégrer dans ton repo

| Fichier | Action | Rôle |
|---|---|---|
| `backend/db.js` | **Nouveau** | Module PostgreSQL (pool `pg`, schéma auto-créé, dégradation gracieuse sans DB) |
| `backend/server.js` | **Remplace** | Serveur existant + persistance + API REST `/api/*` + événements Rétro |
| `backend/package.json` | **Remplace** | Ajout de la dépendance `pg` |
| `frontend/src/pages/Hub.jsx` | **Nouveau** | Page d'accueil : grille d'outils + sessions récentes (poker & rétro) |
| `frontend/src/pages/RetroHome.jsx` | **Nouveau** | Création de rétro : templates de colonnes, nb de votes |
| `frontend/src/pages/RetroInvite.jsx` | **Nouveau** | Page de jointure (`/retro/join/:id`) |
| `frontend/src/pages/Retro.jsx` | **Nouveau** | Tableau de rétro : phases écriture → vote → bilan |
| `frontend/src/api.js` | **Nouveau** | Client REST (même origine que le socket) |
| `frontend/src/App.jsx` | **Remplace** | Routing : `/` → Hub, `/poker`, `/retro` |
| `frontend/src/pages/Home.jsx` | **Remplace** | Ajout du lien « ← Retour aux outils » |

## L'outil Rétrospective

Même philosophie que le Poker : session éphémère en mémoire pilotée par
Socket.IO, snapshot en base à la fin.

- **Templates** : Start·Stop·Continue, Glad·Sad·Mad, 4L, ou colonnes
  personnalisées (2 à 5). Dot-voting configurable (1 à 10 votes/personne).
- **Phase écriture** : chacun poste ses notes ; les autres voient qu'une note
  existe (« ● ● ● ») mais pas son contenu. Les notes sont anonymes — l'auteur
  n'est jamais diffusé, le serveur ne s'en sert que pour les droits de
  suppression.
- **Phase vote** : le facilitateur révèle tout ; chacun répartit ses votes en
  cliquant sur les notes (le plafond est vérifié côté serveur).
- **Bilan** : notes triées par votes, podium des 3 priorités, snapshot
  persisté dans `retro_notes` (transaction, idempotent).

Événements : `retro:create`, `retro:join`, `retro:state` (reconnexion, avec
rebind de l'hôte comme `poker:state`), `retro:note:add`, `retro:note:delete`,
`retro:vote`, `retro:phase`. Seul l'hôte (participant 0) peut changer de phase.

⚠️ Contrairement au broadcast du poker, l'état de la rétro est émis
**par participant** (`io.to(p.id).emit`) puisque chacun voit un état
différent pendant l'écriture.

Aucune modification dans `Poker.jsx`, `Invite.jsx`, `socket.js` — les liens
d'invitation existants (`/join/:id`, `/poker/:id`) restent valides.

## Base de données sur Railway

1. Dans ton projet Railway : **+ New → Database → PostgreSQL**
2. Sur ton service backend : **Variables → + New Variable → Add Reference**
   → sélectionner `DATABASE_URL` du service Postgres
   (Railway injecte l'URL interne `postgres.railway.internal`, sans SSL —
   `db.js` le détecte automatiquement)
3. Redéployer. Le schéma (`sessions`, `poker_results`) se crée tout seul
   au premier démarrage — pas de migration manuelle.

**Sans `DATABASE_URL`** (dev local par exemple), le serveur démarre normalement
en mode mémoire, comme avant. L'API renvoie alors `[]` et la section
« Sessions récentes » du hub ne s'affiche simplement pas.

## API REST ajoutée

```
GET /api/health           → { ok: true, db: true|false }
GET /api/sessions?limit=N → sessions récentes (nom, hôte, nb tâches, statut)
GET /api/sessions/:id     → détail + résultats des votes (tâche, médiane, votes nominatifs)
```

Les routes API sont déclarées **avant** le fallback SPA (`app.get("*")`),
sinon elles renverraient `index.html`.

## Schéma

```sql
sessions      (id, name, host_name, tool, task_count, created_at, finished_at)
poker_results (id, session_id → sessions, task_index, task, median, votes JSONB,
               UNIQUE(session_id, task_index))
retro_notes   (id, session_id → sessions, column_name, content, votes)
```

Une seule table `sessions` pour tout le hub (`tool` = `'poker'` ou `'retro'`),
avec une table de résultats par outil. `GET /api/sessions/:id` renvoie
`results` dans le format propre à l'outil.

## Dev local

```bash
cd backend && npm install && npm start          # mode mémoire
# ou avec une base locale :
DATABASE_URL=postgres://user:pass@localhost:5432/agile npm start

cd frontend && npm install && npm run dev
```

En dev, le proxy Vite redirige déjà les WebSockets ; pour l'API REST,
ajoute dans `vite.config.js` (section `server.proxy`) :

```js
"/api": { target: "http://localhost:3001", changeOrigin: true }
```

## Notes de robustesse

- L'init de la base fait 5 tentatives espacées de 3 s (utile si Postgres
  démarre après l'app), puis bascule en mode mémoire sans bloquer le serveur.
- Toutes les écritures DB sont asynchrones et n'impactent jamais le temps réel.
- Le snapshot de rétro est transactionnel et idempotent (DELETE + INSERT).

## Pistes pour la suite

- **Daily Timer** : outil purement temps réel, le `startTimer` du serveur
  est déjà généralisable.
- **Kanban** : premier outil où la base devient la source de vérité
  (les cartes survivent entre les sessions), bon banc d'essai avant
  d'aller vers du "vrai" Jira-like.
- **Rétro : plan d'action** : transformer les notes les plus votées en
  actions assignées (table `retro_actions`), rappelées à la rétro suivante.
- **Comptes utilisateurs** : à ce stade, un simple pseudo suffit ; si tu veux
  des espaces d'équipe persistants, ajoute une table `teams` + un code d'accès
  avant de te lancer dans de l'auth complète.
