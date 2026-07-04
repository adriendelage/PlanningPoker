# 🃏 Planning Poker Pro

Application de planning poker en temps réel — React + Node.js + Socket.IO.
https://mr1dridri.netlify.app/

## Stack

| Couche    | Techno              | Hébergement recommandé |
|-----------|---------------------|------------------------|
| Frontend  | React + Vite        | **Netlify**            |
| Backend   | Node.js + Socket.IO | **Railway** ou Render  |

---

## Développement local

### 1. Cloner le repo

```bash
git clone https://github.com/TON_USER/planning-poker-pro.git
cd planning-poker-pro
```

### 2. Backend

```bash
cd backend
npm install
npm start
# → http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Le proxy Vite redirige automatiquement les WebSockets vers `localhost:3001` — pas besoin de configuration supplémentaire en local.

---

## Déploiement Netlify + Railway (recommandé)

### Étape 1 — Déployer le backend sur Railway

1. Créer un compte sur [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Sélectionner ce repo, choisir le dossier **`backend`** comme root
4. Railway détecte automatiquement Node.js et lance `npm start`
5. Dans **Settings → Networking** : générer un domaine public
6. Copier l'URL générée, ex : `https://planning-poker-backend-xxxx.railway.app`

### Étape 2 — Déployer le frontend sur Netlify

**Option A — Interface Netlify (le plus simple)**

1. Aller sur [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Connecter ton repo GitHub
3. Configurer le build :
   - **Base directory** : `frontend`
   - **Build command** : `npm run build`
   - **Publish directory** : `frontend/dist`
4. Dans **Site configuration → Environment variables**, ajouter :
   ```
   VITE_SERVER_URL = https://planning-poker-backend-xxxx.railway.app
   ```
5. **Deploy site** ✅

> Le fichier `netlify.toml` à la racine du repo configure automatiquement tout ça — tu peux juste skip l'étape 3 si tu utilises l'UI Netlify.

**Option B — GitHub Actions (CI/CD automatique)**

Ajouter ces secrets dans **GitHub → Settings → Secrets and variables → Actions** :

| Secret              | Valeur                                      |
|---------------------|---------------------------------------------|
| `NETLIFY_AUTH_TOKEN`| Ton token Netlify (User settings → OAuth)   |
| `NETLIFY_SITE_ID`   | L'ID de ton site Netlify (Site settings)    |
| `VITE_SERVER_URL`   | URL Railway de ton backend                  |

Chaque push sur `main` déclenche automatiquement un build + deploy.

---

## Alternative : Render.com

Le fichier `render.yaml` à la racine permet un déploiement en un clic sur [render.com](https://render.com) :

1. **New** → **Blueprint** → connecter ce repo
2. Render lit `render.yaml` et crée le service backend automatiquement

---

## Variables d'environnement

### Frontend (`frontend/.env.local` en dev)

| Variable          | Description                          | Exemple                                        |
|-------------------|--------------------------------------|------------------------------------------------|
| `VITE_SERVER_URL` | URL du backend WebSocket             | `https://mon-backend.railway.app`              |

> En dev local, ne pas définir cette variable — le proxy Vite prend le relais.

### Backend

| Variable | Description       | Défaut |
|----------|-------------------|--------|
| `PORT`   | Port d'écoute     | `3001` |

---

## Structure du projet

```
planning-poker-pro/
├── frontend/              # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx   # Création de session
│   │   │   ├── Invite.jsx # Rejoindre une session
│   │   │   └── Poker.jsx  # Table de jeu
│   │   ├── socket.js      # Singleton Socket.IO
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   └── vite.config.js
├── backend/               # Node.js + Socket.IO
│   ├── server.js
│   └── railway.toml
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI/CD GitHub Actions
├── netlify.toml           # Config build Netlify
├── render.yaml            # Config Render.com
└── README.md
```
