# 🚀 Guide de déploiement — Planning Poker

## Architecture réseau

```
Internet
   │
   ▼
[Box/Routeur]  ←── redirection de ports
   │
   ├── Port 80  → Machine serveur : port 80  (frontend)
   └── Port 3001 → Machine serveur : port 3001 (backend WebSocket)
   
[Machine serveur]
   ├── Nginx  (sert le frontend buildé, port 80)
   └── Node.js backend (port 3001)
```

---

## Étape 1 — Prérequis sur le serveur

```bash
# Installer Node.js (si pas déjà fait)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Installer Nginx
sudo apt install -y nginx

# Installer PM2 (gestionnaire de processus Node)
sudo npm install -g pm2
```

---

## Étape 2 — Déployer le backend

```bash
cd planning-poker-pro-modified/backend
npm install
pm2 start server.js --name planning-poker-backend
pm2 save
pm2 startup   # pour démarrer automatiquement au boot
```

Vérifier que ça tourne :
```bash
pm2 status
# ou
curl http://localhost:3001
```

---

## Étape 3 — Builder et déployer le frontend

```bash
cd planning-poker-pro-modified/frontend
npm install
npm run build
# Les fichiers buildés sont dans ./dist/
```

Copier le build dans le dossier servi par Nginx :
```bash
sudo cp -r dist/* /var/www/html/planning-poker/
```

---

## Étape 4 — Configurer Nginx

Créer le fichier de config :
```bash
sudo nano /etc/nginx/sites-available/planning-poker
```

Coller ceci (remplacer `TON_IP_OU_DOMAINE`) :
```nginx
server {
    listen 80;
    server_name TON_IP_OU_DOMAINE;   # ex: 192.168.1.50 ou mondomaine.fr

    root /var/www/html/planning-poker;
    index index.html;

    # SPA — redirige tout vers index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy WebSocket vers le backend Node.js
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Activer le site :
```bash
sudo ln -s /etc/nginx/sites-available/planning-poker /etc/nginx/sites-enabled/
sudo nginx -t          # vérifier la config
sudo systemctl reload nginx
```

> ⚠️ Avec cette config Nginx, le frontend ET le backend WebSocket passent tous les **deux par le port 80** — il n'est donc pas nécessaire d'ouvrir le port 3001 sur internet, seulement le **port 80**.

---

## Étape 5 — Redirection de ports sur ta box

### Sur une Freebox / Bbox / Livebox / SFR Box :

1. Connecte-toi à l'interface admin de ta box :
   - Freebox : http://mafreebox.freebox.fr → Paramètres → Mode avancé → Réseau → Redirections de ports
   - Bbox : http://192.168.1.254 → Réseau → Redirections de ports
   - Livebox : http://192.168.1.1 → Réseau > Avancé > Redirections de ports
   - SFR Box : http://192.168.0.1 → Réseau > Pare-feu > Redirections de ports

2. Créer une règle :

| Champ         | Valeur                          |
|---------------|---------------------------------|
| Protocole     | TCP                             |
| Port externe  | 80                              |
| IP destination| IP locale de ton serveur        |
| Port destination | 80                           |
| Description   | Planning Poker                  |

3. Trouver l'IP locale de ton serveur :
```bash
ip addr show | grep "inet " | grep -v 127
# Ex : 192.168.1.50
```

4. Trouver ton IP publique :
```bash
curl ifconfig.me
```

---

## Étape 6 — Optionnel : IP fixe locale

Pour éviter que l'IP locale de ton serveur change (sinon la redirection de port ne fonctionnera plus) :

```bash
# Réserver l'IP dans ta box via l'adresse MAC
ip link show | grep "link/ether"
# Copier l'adresse MAC et la réserver dans l'interface de ta box (DHCP statique)
```

---

## Accès final

- **Depuis ton réseau local** : `http://192.168.1.50`
- **Depuis internet** : `http://TON_IP_PUBLIQUE`
- **Avec un nom de domaine** : configurer un enregistrement DNS `A` qui pointe vers ton IP publique

---

## Dépannage rapide

```bash
# Backend ne répond pas
pm2 logs planning-poker-backend

# Nginx erreur
sudo tail -f /var/log/nginx/error.log

# Firewall local (si actif)
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp  # seulement si tu n'utilises pas Nginx comme proxy
```
