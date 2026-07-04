# 🧰 Agile Toolbox — Guide d'intégration

Extension de Planning Poker Pro en boîte à outils complète : hub d'accueil,
persistance PostgreSQL, historique privé (local au navigateur), et 14
nouveaux outils — **Rétrospective**, **Daily Timer**, **Kanban léger**,
**Suivi de vélocité**, **OKR léger**, **Rétro-planning** (Gantt + chemin
critique), **Planificateur de capacité**, **Sondage rapide**, **Objectif
de sprint**, **Definition of Done**, **Journal de décisions**,
**Post-mortem d'incident**, **Suivi de feature flags**, **Pouls d'équipe**,
et la **Roue de décision** (100 % client, sans backend).

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
| `frontend/src/cpm.js` | **Nouveau** | Moteur de calcul du chemin critique (fonction pure, testée isolément) |
| `frontend/src/pages/GanttHome.jsx` | **Nouveau** | Création d'un rétro-planning |
| `frontend/src/pages/Gantt.jsx` | **Nouveau** | Graphique de Gantt (SVG fait main) + tâches/dépendances + chemin critique |
| `frontend/src/pages/CapacityHome.jsx` | **Nouveau** | Création d'un tableau de capacité |
| `frontend/src/pages/Capacity.jsx` | **Nouveau** | Planification de sprint : disponibilité par membre, capacité suggérée, historique |
| `frontend/src/pages/PollHome.jsx` | **Nouveau** | Création d'un sondage (question + options) |
| `frontend/src/pages/Poll.jsx` | **Nouveau** | Vote en direct, tally live, clôture par l'hôte |
| `frontend/src/pages/GoalHome.jsx` | **Nouveau** | Création d'un tableau d'objectifs de sprint |
| `frontend/src/pages/Goal.jsx` | **Nouveau** | Objectif + votes de confiance + historique atteint/manqué |
| `frontend/src/pages/DodHome.jsx` | **Nouveau** | Création d'une Definition of Done |
| `frontend/src/pages/Dod.jsx` | **Nouveau** | Checklist partagée, cochable, réinitialisable |
| `frontend/src/pages/DecisionsHome.jsx` | **Nouveau** | Création d'un journal de décisions |
| `frontend/src/pages/Decisions.jsx` | **Nouveau** | ADR léger : titre, contexte, statut (proposée/acceptée/obsolète) |
| `frontend/src/pages/PostmortemHome.jsx` | **Nouveau** | Création d'un post-mortem (un tableau = un incident) |
| `frontend/src/pages/Postmortem.jsx` | **Nouveau** | Chronologie, cause racine, actions correctives |
| `frontend/src/pages/FlagsHome.jsx` | **Nouveau** | Création d'un suivi de feature flags |
| `frontend/src/pages/Flags.jsx` | **Nouveau** | Liste de flags avec switch, environnement, propriétaire |
| `frontend/src/pages/PulseHome.jsx` | **Nouveau** | Création d'un tableau de pouls d'équipe |
| `frontend/src/pages/Pulse.jsx` | **Nouveau** | Check-in d'humeur quotidien + courbe de tendance (SVG fait main) |
| `frontend/src/pages/Wheel.jsx` | **Nouveau** | Roue de décision — 100 % client, aucun appel réseau |

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

## L'outil Rétro-planning (Gantt + chemin critique)

Le plus ambitieux des 7 outils : un vrai graphe de dépendances entre tâches,
avec calcul automatique du **chemin critique** par la méthode CPM
(Critical Path Method).

**Répartition des responsabilités** — c'est le point important de cet
outil : le serveur ne fait que stocker et diffuser les tâches et leurs
dépendances brutes (`{id, name, duration, dependsOn: [id, ...]}`). Le calcul
CPM lui-même (`frontend/src/cpm.js`) est une **fonction pure côté client** :
à graphe identique, le résultat est identique pour tout le monde, donc
inutile de le recalculer sur le serveur et de le renvoyer — chaque
navigateur le recalcule à partir du même état reçu par Socket.IO.

**Ce que fait `cpm.js`, dans l'ordre :**
1. Détection de cycle (DFS à 3 couleurs) — une dépendance circulaire
   (A dépend de B qui dépend de A) rend le calcul impossible ; c'est
   détecté et signalé par une bannière d'avertissement plutôt que de
   planter ou de boucler.
2. Tri topologique (algorithme de Kahn).
3. Passe avant : dates au plus tôt (ES/EF, Earliest Start/Finish).
4. Passe arrière : dates au plus tard (LS/LF, Latest Start/Finish).
5. Marge (`slack = LS - ES`) et chemin critique (tâches à marge nulle).

Ce moteur a été **validé indépendamment de l'interface**, avec un cas de
référence calculé à la main (4 tâches, un chemin critique connu à l'avance)
avant même d'écrire la moindre ligne d'UI — les valeurs ES/EF/LS/LF/marge
obtenues correspondent exactement au calcul manuel.

**Simplification assumée** : le planning raisonne en jours relatifs
(J0, J1, J2…) et non en dates calendaires réelles — pas de gestion des
jours fériés ou week-ends. C'est un choix pour rester simple ; si tu veux
des vraies dates, il faudrait ajouter une date de début de projet et
convertir les jours en dates ouvrées, ce qui complique sensiblement le
calcul (calendrier métier).

**Interaction** : pas de drag-and-drop (redimensionner une barre à la
souris, tracer une dépendance en glissant) — ça demanderait une bonne
quantité de code en plus pour un gain d'ergonomie qui ne semblait pas
justifié dans un premier temps. À la place : formulaires + cases à cocher
pour les dépendances, ce qui reste rapide à l'usage pour un planning de
taille raisonnable (jusqu'à une trentaine de tâches). Le drag-and-drop
reste une piste d'amélioration si le besoin se confirme (voir plus bas).

Événements : `gantt:create`, `gantt:open`, `gantt:task:add`,
`gantt:task:update` (nom/durée), `gantt:task:deps:update` (remplace
l'ensemble des dépendances d'une tâche), `gantt:task:delete` (nettoie
aussi les références orphelines chez les autres tâches). Reprise après
redémarrage vérifiée comme pour les autres outils permanents.

## L'outil Planificateur de capacité

Le complément naturel du Suivi de vélocité : à chaque nouveau sprint, on
saisit la disponibilité (0-100 %) de chaque membre de l'équipe, et l'outil
suggère une capacité en points = vélocité de référence × disponibilité
moyenne de l'équipe.

**Simplification assumée** : pas de lien en base entre ce tableau et un
tableau de Vélocité existant — la "vélocité de référence" est un simple
champ numérique que l'utilisateur renseigne à la main (typiquement en
regardant son tableau de Vélocité à côté). Un vrai lien inter-outils
(aller chercher automatiquement la vélocité moyenne d'un tableau existant)
demanderait de faire référence à une autre session depuis le serveur, ce
qui casserait l'indépendance actuelle de chaque tableau — une piste pour
plus tard si le besoin se confirme, mais pas nécessaire pour que l'outil
soit utile dès maintenant.

Contrairement au Gantt où le calcul (CPM) est fait côté client car
partagé par construction, ici le calcul (une simple moyenne) est fait
**côté serveur**, au moment de l'ajout d'une entrée — ça garantit que la
valeur stockée en base est figée au moment de la saisie, même si la
vélocité de référence est ensuite réutilisée différemment sur un sprint
suivant.

Événements : `capacity:create`, `capacity:open`, `capacity:entry:add`
(bornes serveur : vélocité 0-9999, disponibilité 0-100 par membre, 30
membres max par entrée, noms vides filtrés), `capacity:entry:delete`.
Reprise après redémarrage vérifiée comme pour les autres outils permanents.

## L'outil Sondage rapide

Le seul des 15 outils qui reste **éphémère mais sans étape de jointure** :
comme le vote est anonyme (juste un tally, aucun nom affiché), il n'y a
pas besoin de demander un prénom pour participer — le lien mène
directement au vote. Chaque participant reçoit un état personnalisé
(`myVote`, `isHost`) via un broadcast **par participant**, sur le même
principe que la Rétro.

L'hôte (premier connecté) peut clôturer le sondage, ce qui fige les
résultats et déclenche un snapshot en base (`poll_results`), puis un
nettoyage mémoire après 24h — exactement le cycle de vie du Poker.

Événements : `poll:create`, `poll:join`, `poll:state` (reconnexion, avec
rebind de l'hôte), `poll:vote` (un participant peut changer d'avis tant
que le sondage n'est pas clos), `poll:close` (hôte uniquement).

## L'outil Objectif de sprint

Permanent, sur le modèle de la Vélocité et de la Capacité : à chaque
sprint, on formule l'objectif en une phrase et on recueille la confiance
(1 à 5) de chaque membre — saisie manuelle via une liste nom + niveau,
pas de vote en direct par identité (cohérent avec Capacité, pas
d'authentification dans le hub). Chaque entrée archivée peut ensuite être
marquée « atteint » ou « manqué », ce qui donne un historique utile en
rétro de sprint suivante.

Événements : `goal:create`, `goal:open`, `goal:entry:add` (votes bornés
1-5, 30 max), `goal:entry:achieved` (true/false/null), `goal:entry:delete`.

## L'outil Definition of Done

Le plus simple des 15 : une checklist partagée, cochable par n'importe qui
avec le lien, avec un bouton « Réinitialiser » qui décoche tout sans
supprimer les critères — pensé pour être remis à zéro à chaque nouvelle
story plutôt que recréé à chaque fois.

Événements : `dod:create`, `dod:open`, `dod:item:add`, `dod:item:toggle`,
`dod:item:delete`, `dod:reset` (décoche tous les items sans les supprimer).

## L'outil Journal de décisions

Un ADR (Architecture Decision Record) léger : titre, contexte, décidé par
qui, et un statut parmi `proposée` / `acceptée` / `obsolète`. Les décisions
les plus récentes remontent en haut (`ORDER BY created_at DESC`).

Événements : `decisions:create`, `decisions:open`, `decisions:add`,
`decisions:status` (les 3 valeurs de statut sont validées côté serveur),
`decisions:delete`.

## L'outil Post-mortem d'incident

Contrairement aux autres outils permanents (une session = un tableau
réutilisable indéfiniment), ici **une session = un incident** — la
relation avec `postmortems` est 1:1 (`session_id` est la clé primaire de
la table, pas une clé étrangère classique). Trois sections indépendantes :
chronologie (liste d'événements horodatés), cause racine (un texte libre,
enregistré `onBlur` plutôt qu'à chaque frappe), actions correctives
(checklist avec cases à cocher).

Simplification technique à connaître : la chronologie et les actions sont
stockées en JSONB et réécrites **en entier** à chaque modification
(`postmortemSave` fait un upsert de tout l'objet), plutôt que des lignes
SQL individuelles comme pour le Kanban. C'est plus simple à coder et
largement suffisant pour un outil à faible concurrence (une poignée de
personnes qui complètent un post-mortem ensemble, pas des dizaines en
simultané) ; l'inconvénient est que deux modifications strictement
simultanées sur des champs différents pourraient s'écraser l'une l'autre
dans de rares cas — acceptable ici, mais à garder en tête si l'usage
change.

Événements : `postmortem:create`, `postmortem:open`,
`postmortem:timeline:add/delete`, `postmortem:rootcause:update`,
`postmortem:action:add/toggle/delete`.

## L'outil Suivi de feature flags

Une liste de flags avec un switch actif/inactif, un environnement
(dev/staging/prod), un propriétaire et des notes libres — l'édition de
ces trois derniers champs se fait via un petit formulaire repliable par
ligne plutôt qu'un formulaire toujours visible, pour garder la liste
lisible quand elle grossit.

Événements : `flags:create`, `flags:open`, `flags:add`, `flags:toggle`,
`flags:update` (environnement/propriétaire/notes), `flags:delete`.

## L'outil Pouls d'équipe

Un check-in d'humeur (1 à 5, avec emojis) par personne et par jour —
`UNIQUE(session_id, name, day)` en base avec un `ON CONFLICT DO UPDATE`
: si quelqu'un refait son check-in dans la même journée, ça met à jour
sa valeur plutôt que d'en créer une deuxième (vérifié par test). La
tendance est affichée comme une courbe (moyenne du jour), en SVG fait
main sur le même principe que le graphique de Vélocité.

Événements : `pulse:create`, `pulse:open`, `pulse:checkin` (upsert
serveur + mémoire).

## L'outil Roue de décision

Le seul outil qui n'a **ni backend, ni base de données, ni Socket.IO** :
une simple page React avec état local (liste de noms, angle de rotation),
une animation CSS (`transition: transform`) calculée pour faire
correspondre l'angle final à un gagnant tiré aléatoirement. Comme il n'y
a pas de session à créer, il n'y a pas de lien à partager ni d'entrée dans
« Mes sessions » — c'est un outil qu'on utilise sur son propre écran
pendant une réunion, pas quelque chose qu'on revient consulter plus tard.

Aucun événement serveur — tout se passe dans `Wheel.jsx`.

## Base de données sur Railway

1. Dans ton projet Railway : **+ New → Database → PostgreSQL**
2. Sur ton service backend : **Variables → + New Variable → Add Reference**
   → sélectionner `DATABASE_URL` du service Postgres
   (Railway injecte l'URL interne `postgres.railway.internal`, sans SSL —
   `db.js` le détecte automatiquement)
3. Redéployer. Le schéma (`sessions`, `poker_results`, etc.) se crée tout
   seul au premier démarrage — pas de migration manuelle.

**Sans `DATABASE_URL`** (dev local par exemple), le serveur démarre normalement
en mode mémoire, comme avant. Les outils éphémères (Poker, Rétro, Daily, Sondage)
fonctionnent normalement mais sans persistance ; les outils permanents
(Kanban, Vélocité, OKR, Gantt, Capacité, Objectif de sprint, DoD, Journal
de décisions, Post-mortem, Feature flags, Pouls d'équipe) répondent
`*:notfound` à la réouverture d'un lien existant, puisqu'ils dépendent
entièrement de la base pour se recharger. La Roue de décision n'est
concernée par rien de tout ça, elle n'a pas de backend.

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
gantt_tasks     (id, session_id → sessions, name, duration, position, created_at)
gantt_dependencies (id, task_id → gantt_tasks, depends_on_id → gantt_tasks,
                    UNIQUE(task_id, depends_on_id))
capacity_entries (id, session_id → sessions, sprint_name, ref_velocity,
                  members JSONB, suggested, created_at)
poll_results    (id, session_id → sessions, option_text, vote_count)
sprint_goals    (id, session_id → sessions, sprint_name, goal_text,
                 votes JSONB, achieved BOOLEAN, created_at)
dod_items       (id, session_id → sessions, text, checked, position, created_at)
decisions       (id, session_id → sessions, title, context, decided_by,
                 status, created_at)
postmortems     (session_id → sessions [clé primaire], timeline JSONB,
                 root_cause, actions JSONB)
feature_flags   (id, session_id → sessions, name, active, environment,
                 owner, notes, created_at)
pulse_entries   (id, session_id → sessions, name, mood, day,
                 UNIQUE(session_id, name, day))
```

Une seule table `sessions` pour tout le hub (`tool` = `poker` / `retro` /
`daily` / `kanban` / `velocity` / `okr` / `gantt` / `capacity` / `poll` /
`goal` / `dod` / `decisions` / `postmortem` / `flags` / `pulse`), avec une
ou deux tables de résultats par outil. La Roue de décision n'a pas de
ligne dans `sessions` — elle n'a pas de backend du tout. Ces données ne
sont plus exposées via HTTP (voir plus haut), mais `db.getSession(id)`
reste disponible côté serveur pour un futur usage interne (export, admin).

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
- Le snapshot de rétro et le snapshot de sondage sont transactionnels et
  idempotents (DELETE + INSERT).
- Le Post-mortem réécrit tout son état JSONB à chaque modification plutôt
  que des lignes SQL individuelles (voir la section dédiée) — un choix
  pragmatique pour un outil à faible concurrence, à revoir si l'usage change.
- Le Pouls d'équipe utilise un `UNIQUE(session_id, name, day)` avec
  `ON CONFLICT DO UPDATE` pour éviter les doublons de check-in — vérifié
  par test qu'un second check-in le même jour met à jour plutôt que dupliquer.

## Pistes pour la suite

Les 15 outils du hub sont maintenant tous fonctionnels (14 avec backend +
la Roue de décision, 100 % client). Pistes pour aller plus loin :

- **Capacité ↔ Vélocité** : lier réellement les deux tableaux (récupérer
  automatiquement la vélocité moyenne d'un tableau de Vélocité existant
  plutôt que de la ressaisir à la main) — la première vraie référence
  inter-outils du hub, à faire si le besoin se confirme.
- **Gantt : dates calendaires réelles** : remplacer les jours relatifs
  (J0, J1…) par de vraies dates, avec gestion des week-ends/jours fériés —
  complexifie le calcul mais rapproche l'outil d'un vrai planning projet.
- **Gantt : drag-and-drop** : redimensionner les barres à la souris pour
  changer la durée, tracer une dépendance en glissant d'une barre à
  l'autre. Le moteur CPM (`cpm.js`) n'a pas besoin de changer, seule
  l'interaction serait à ajouter.
- **Gantt ↔ Kanban** : lier une tâche du Gantt à une carte Kanban pour
  suivre son avancement réel (pas seulement planifié).
- **Post-mortem ↔ Journal de décisions** : une action corrective issue
  d'un post-mortem pourrait devenir une décision tracée dans le Journal.
- **OKR : historique de progression** : actuellement seule la valeur
  courante de chaque résultat clé est gardée ; une table `okr_history`
  (snapshot horodaté à chaque mise à jour) permettrait un graphique
  d'évolution dans le temps, comme pour la Vélocité et le Pouls d'équipe.
- **Rétro : plan d'action** : transformer les notes les plus votées en
  actions assignées (table `retro_actions`), rappelées à la rétro suivante —
  pourrait réutiliser le modèle de checklist du Post-mortem.
- **Feature flags : historique d'activation** : tracer qui a activé/désactivé
  un flag et quand, plutôt que de ne garder que l'état courant.
- **Comptes / espaces d'équipe** : à ce stade, un simple pseudo suffit ;
  regrouper tous les tableaux permanents d'une même équipe sous un espace
  partagé serait la vraie marche vers du "Jira-like" — mais demande une
  vraie notion de compte, à ne faire que si le besoin se confirme.
