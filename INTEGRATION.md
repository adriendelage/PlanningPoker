# 🧰 Agile Toolbox — Guide d'intégration

Extension de Planning Poker Pro en boîte à outils complète : hub d'accueil,
persistance PostgreSQL, et 3 nouveaux outils — **Rétrospective**,
**Daily Timer** et **Kanban léger**.

## Fichiers à intégrer dans ton repo

| Fichier | Action | Rôle |
|---|---|---|
| `backend/db.js` | **Nouveau** | Module PostgreSQL (pool `pg`, schéma auto-créé, dégradation gracieuse sans DB) |
| `backend/server.js` | **Remplace** | Serveur + persistance + événements Rétro/Daily/Kanban — **aucun endpoint public de liste** |
| `backend/package.json` | **Remplace** | Ajout de la dépendance `pg` |
| `backend/package-lock.json` | **Remplace** | Synchronisé avec `pg` (nécessaire pour `npm ci`) |
| `frontend/src/localHistory.js` | **Nouveau** | Historique **local au navigateur** (remplace l'ancien `api.js`, supprimé) |
| `frontend/src/pages/Hub.jsx` | **Remplace** | Grille d'outils + « Mes sessions » (lu depuis `localStorage`, pas du serveur) |
| `frontend/src/pages/Home.jsx` | **Remplace** | Enregistre la création dans l'historique local |
| `frontend/src/pages/Invite.jsx` | **Remplace** | Enregistre la jointure dans l'historique local |
| `frontend/src/pages/RetroHome.jsx` | **Remplace** | idem, pour la Rétro |
| `frontend/src/pages/RetroInvite.jsx` | **Remplace** | idem, pour la Rétro |
| `frontend/src/pages/Retro.jsx` | **Nouveau** | Tableau de rétro : phases écriture → vote → bilan |
| `frontend/src/pages/DailyHome.jsx` | **Remplace** | idem, pour le Daily |
| `frontend/src/pages/DailyInvite.jsx` | **Remplace** | idem, pour le Daily |
| `frontend/src/pages/Daily.jsx` | **Nouveau** | Lobby → rotation chronométrée → bilan des temps |
| `frontend/src/pages/KanbanHome.jsx` | **Remplace** | idem, pour le Kanban |
| `frontend/src/pages/Kanban.jsx` | **Remplace** | Tableau partagé permanent + trace la visite localement |

⚠️ **`frontend/src/api.js` doit être supprimé de ton repo** — il n'est plus
utilisé par rien (le hub ne fait plus aucun appel réseau pour son historique).

## Confidentialité — pourquoi pas de liste publique des sessions

La première version du hub affichait un historique global (« Sessions
récentes ») alimenté par `GET /api/sessions` : n'importe quel visiteur du
site pouvait voir le nom de toutes les sessions créées par tout le monde,
y compris leur contenu une fois terminées. C'est le genre de fuite qu'on
ne veut évidemment pas.

**Ce qui a été retiré :**
- Les routes `GET /api/sessions` et `GET /api/sessions/:id` n'existent plus.
- `frontend/src/api.js` (le client qui les appelait) est supprimé.

**Ce qui les remplace : un historique 100 % local au navigateur.**
`frontend/src/localHistory.js` enregistre dans le `localStorage` de chaque
visiteur les sessions qu'*il* a créées ou rejointes — jamais transmis au
serveur, jamais visible par quelqu'un d'autre. Le hub affiche cette liste
sous « Mes sessions », avec un bouton pour retirer une entrée.

**Pourquoi pas une solution par IP ou par compte ?**
- *Par IP* : peu fiable (NAT d'entreprise, 4G partagée, VPN — plusieurs
  personnes partagent souvent la même IP publique) et donnerait une fausse
  impression de confidentialité tout en ajoutant de la complexité.
- *Par compte* : demanderait un système d'authentification complet
  (inscription, mots de passe ou OAuth, sessions serveur) disproportionné
  pour un outil que l'équipe utilise sans friction via un simple lien.

La base garde toujours les données (`sessions`, `poker_results`,
`retro_notes`, `daily_times`, `kanban_cards`) pour la fiabilité et un futur
usage interne éventuel (export CSV pour toi, par exemple), mais rien n'est
plus exposé publiquement via HTTP.

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

## L'outil Daily Timer

Session éphémère comme le Poker/la Rétro. Un lobby où l'équipe se rassemble
(ordre de passage = ordre d'arrivée), puis une rotation chronométrée :
chaque speaker a un temps alloué (**plancher forcé à 30 secondes**, plafond
600s, côté serveur), le décompte peut passer en négatif (dépassement affiché
en rouge). Le speaker courant *ou* l'hôte peut passer au suivant — pratique
si l'animateur veut garder la main, ou laisser chacun s'autogérer.

Événements : `daily:create`, `daily:join`, `daily:state` (reconnexion),
`daily:start` (hôte uniquement), `daily:next`. Le temps de chacun est
incrémenté serveur-side chaque seconde et persisté dans `daily_times`
à la fin.

Note de robustesse : une coupure réseau pendant la rotation (`phase !==
"lobby"`) ne retire **pas** le participant — sinon la liste des speakers
se désynchroniserait en plein daily. Seules les déconnexions en lobby
sont nettoyées.

## L'outil Kanban léger

Seul outil du hub où **la base est la source de vérité** — pas de nettoyage
après 24h, pas de notion de session "terminée". On crée un tableau une fois,
on garde le lien, on y revient (et l'équipe aussi, en simultané).

Chaque tableau a 3 colonnes fixes : À faire, En cours, Terminé. En mémoire,
`kanbans[id]` sert de cache pour diffuser le temps réel (room Socket.IO
`kb:<id>`) ; à froid, `db.kanbanLoadBoard(id)` recharge tout depuis
`kanban_cards`. Vérifié par test : un tableau créé, modifié, puis **redémarrage
complet du serveur** (mémoire vidée, comme un redeploy Railway) → le tableau
se recharge à l'identique à la prochaine ouverture.

Événements : `kanban:create`, `kanban:open` (charge depuis la base si absent
de la mémoire), `kanban:card:add`, `kanban:card:move`, `kanban:card:delete`.
Sans `DATABASE_URL`, `kanban:open` renvoie `kanban:notfound` après un
redémarrage — c'est attendu, l'outil n'a de sens qu'avec une base.

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
daily_times   (id, session_id → sessions, name, seconds_used)
kanban_cards  (id, session_id → sessions, column_name, title, created_at)
```

Une seule table `sessions` pour tout le hub (`tool` = `poker` / `retro` /
`daily` / `kanban`), avec une table de résultats par outil.
`GET /api/sessions/:id` renvoie `results` dans le format propre à l'outil.

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

Les 4 outils du hub sont maintenant tous fonctionnels. Pistes pour aller
plus loin :

- **Rétro : plan d'action** : transformer les notes les plus votées en
  actions assignées (table `retro_actions`), rappelées à la rétro suivante.
- **Kanban : plus de colonnes / drag & drop** : actuellement 3 colonnes
  fixes et déplacement par boutons ← → (pas de bibliothèque de drag & drop,
  volontairement, pour rester léger) ; une lib comme `@dnd-kit/core` peut
  s'ajouter sans toucher au modèle serveur.
- **Kanban : plusieurs tableaux liés à une équipe** : aujourd'hui chaque
  tableau est un lien isolé ; regrouper plusieurs tableaux sous un espace
  d'équipe serait la vraie marche vers du "Jira-like".
- **Comptes utilisateurs** : à ce stade, un simple pseudo suffit ; si tu veux
  des espaces d'équipe persistants, ajoute une table `teams` + un code d'accès
  avant de te lancer dans de l'auth complète.
