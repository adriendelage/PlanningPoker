# 🧰 Agile Toolbox — Guide d'intégration

Extension de Planning Poker Pro en boîte à outils complète : hub d'accueil,
persistance PostgreSQL, historique privé (local au navigateur), et 5 nouveaux
outils — **Rétrospective**, **Daily Timer**, **Kanban léger**,
**Suivi de vélocité** et **OKR léger**.

## Fichiers à intégrer dans ton repo

| Fichier | Action | Rôle |
|---|---|---|
| `backend/db.js` | **Nouveau** | Module PostgreSQL (pool `pg`, schéma auto-créé, dégradation gracieuse sans DB) |
| `backend/server.js` | **Remplace** | Serveur + persistance + événements Rétro/Daily/Kanban/Vélocité/OKR — **aucun endpoint public de liste** |
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
| `frontend/src/pages/VelocityHome.jsx` | **Nouveau** | Création d'un tableau de vélocité |
| `frontend/src/pages/Velocity.jsx` | **Nouveau** | Graphique engagé/livré (SVG fait main) + stats + historique des sprints |
| `frontend/src/pages/OkrHome.jsx` | **Nouveau** | Création d'un cycle OKR |
| `frontend/src/pages/Okr.jsx` | **Nouveau** | Objectifs + résultats clés, progression mise à jour en direct |

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

## L'outil Suivi de vélocité

Même famille que le Kanban : outil **permanent**, la base est la source de
vérité, pas de session à rejoindre. On crée un tableau par équipe/projet,
et on ajoute un sprint (nom, points engagés, points livrés) à chaque fin
d'itération. Le graphique en barres est du SVG fait main — aucune librairie
de charting ajoutée, pour rester cohérent avec le reste du projet (aucun
autre outil n'a de dépendance de rendu).

Stats calculées côté client à partir des données reçues en temps réel :
vélocité moyenne sur les 3 derniers sprints, total livré, et un indicateur
de « fiabilité d'engagement » (livré ÷ engagé, en %) qui aide à calibrer
les engagements de sprint suivants.

Événements : `velocity:create`, `velocity:open`, `velocity:sprint:add`
(valeurs bornées 0-9999 côté serveur), `velocity:sprint:delete`. Vérifié
par test comme le Kanban : un tableau créé puis **redémarrage complet du
serveur** → les sprints se rechargent à l'identique.

## L'outil OKR léger

Toujours le même modèle permanent. Un cycle (ex: "Q3 2026") contient des
**objectifs**, chacun avec une liste de **résultats clés** notés de 0 à
100 %. La progression de chaque résultat clé se pilote avec des boutons
+10/−10 plutôt qu'un slider brut — un slider glissé enverrait un événement
Socket.IO (et une écriture en base) à chaque pixel de déplacement, ce qui
aurait spammé la synchronisation temps réel entre participants.

La progression d'un objectif est la moyenne de ses résultats clés, et la
progression globale du cycle est affichée en haut du tableau.

Événements : `okr:create`, `okr:open`, `okr:objective:add`,
`okr:objective:delete`, `okr:kr:add`, `okr:kr:update` (progression bornée
0-100 côté serveur), `okr:kr:delete`. Reprise après redémarrage vérifiée
comme pour le Kanban et la Vélocité.

## Base de données sur Railway

1. Dans ton projet Railway : **+ New → Database → PostgreSQL**
2. Sur ton service backend : **Variables → + New Variable → Add Reference**
   → sélectionner `DATABASE_URL` du service Postgres
   (Railway injecte l'URL interne `postgres.railway.internal`, sans SSL —
   `db.js` le détecte automatiquement)
3. Redéployer. Le schéma (`sessions`, `poker_results`) se crée tout seul
   au premier démarrage — pas de migration manuelle.

**Sans `DATABASE_URL`** (dev local par exemple), le serveur démarre normalement
en mode mémoire, comme avant. Les outils éphémères (Poker, Rétro, Daily)
fonctionnent normalement mais sans persistance ; les outils permanents
(Kanban, Vélocité, OKR) répondent `*:notfound` à la réouverture d'un lien
existant, puisqu'ils dépendent entièrement de la base pour se recharger.

## API REST

```
GET /api/health → { ok: true, db: true|false }
```

C'est le seul endpoint HTTP exposé — voir la section confidentialité
ci-dessus pour le pourquoi. Toutes les autres interactions passent par
Socket.IO.

## Schéma

```sql
sessions        (id, name, host_name, tool, task_count, created_at, finished_at)
poker_results   (id, session_id → sessions, task_index, task, median, votes JSONB,
                 UNIQUE(session_id, task_index))
retro_notes     (id, session_id → sessions, column_name, content, votes)
daily_times     (id, session_id → sessions, name, seconds_used)
kanban_cards    (id, session_id → sessions, column_name, title, created_at)
velocity_sprints(id, session_id → sessions, sprint_name, committed, completed, created_at)
okr_objectives  (id, session_id → sessions, title, position, created_at)
okr_key_results (id, objective_id → okr_objectives, title, progress, position, created_at)
```

Une seule table `sessions` pour tout le hub (`tool` = `poker` / `retro` /
`daily` / `kanban` / `velocity` / `okr`), avec une ou deux tables de
résultats par outil. Ces données ne sont plus exposées via HTTP (voir
plus haut), mais `db.getSession(id)` reste disponible côté serveur pour
un futur usage interne (export, admin).

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

Les 6 outils du hub sont maintenant tous fonctionnels. Pistes pour aller
plus loin :

- **Vélocité ↔ Poker** : aujourd'hui les deux outils sont indépendants ;
  relier automatiquement les points estimés en Poker à un sprint de
  Vélocité éviterait la ressaisie manuelle.
- **OKR : historique de progression** : actuellement seule la valeur
  courante de chaque résultat clé est gardée ; une table `okr_history`
  (snapshot horodaté à chaque mise à jour) permettrait un graphique
  d'évolution dans le temps, comme pour la Vélocité.
- **Rétro : plan d'action** : transformer les notes les plus votées en
  actions assignées (table `retro_actions`), rappelées à la rétro suivante.
- **Kanban : plus de colonnes / drag & drop** : actuellement 3 colonnes
  fixes et déplacement par boutons ← → (pas de bibliothèque de drag & drop,
  volontairement, pour rester léger) ; une lib comme `@dnd-kit/core` peut
  s'ajouter sans toucher au modèle serveur.
- **Matrice Impact/Effort** : un outil de priorisation à 4 quadrants,
  réutilisant le pattern de déplacement du Kanban mais avec des
  coordonnées x/y libres plutôt que des colonnes fixes.
- **Comptes / espaces d'équipe** : à ce stade, un simple pseudo suffit ;
  regrouper Kanban + Vélocité + OKR d'une même équipe sous un espace
  partagé serait la vraie marche vers du "Jira-like" — mais demande une
  vraie notion de compte, à ne faire que si le besoin se confirme.
