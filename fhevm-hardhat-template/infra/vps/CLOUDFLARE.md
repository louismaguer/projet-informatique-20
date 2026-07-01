# Déploiement sur VPS — Deux options d'exposition publique

## Option 1 : Cloudflare Tunnel (recommandé, 0 config DNS)

URL fixe, pas besoin d'ouvrir de ports, cache DDoS inclus.

### Prérequis
- Un compte Cloudflare (gratuit) — https://dash.cloudflare.com/sign-up
- Un domaine ajouté à Cloudflare (gratuit pour l'ajout, le domaine lui-même coûte 1-15€/an)

### Étapes

#### 1. Ajouter le domaine à Cloudflare
1. Sur https://dash.cloudflare.com, "Add a Site"
2. Entrer ton domaine (ex: `mondomaine.xyz`)
3. Choisir le plan **Free**
4. Cloudflare te donne 2 nameservers à configurer chez ton registrar
5. Attendre la propagation (jusqu'à 24h)

#### 2. Créer le tunnel sur le VPS
```bash
# Login (ouvre un navigateur)
cloudflared tunnel login

# Créer un tunnel nommé
cloudflared tunnel create fhevm-vote

# Noter l'UUID du tunnel (ex: 1234abcd-...)
TUNNEL_ID=$(cloudflared tunnel list | grep fhevm-vote | awk '{print $1}')
echo $TUNNEL_ID
```

#### 3. Configurer le tunnel
Créer `/etc/cloudflared/config.yml` :
```yaml
tunnel: fhevm-vote
credentials-file: /etc/cloudflared/.cloudflared/<UUID>.json

ingress:
  - hostname: vote.mondomaine.xyz
    service: http://localhost:8080
  - service: http_status:404
```

#### 4. Router le DNS
```bash
cloudflared tunnel route dns fhevm-vote vote.mondomaine.xyz
```

#### 5. Lancer le tunnel comme service
```bash
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
systemctl status cloudflared
```

#### 6. Test
```bash
curl -I https://vote.mondomaine.xyz
```

Tu devrais voir `200 OK` ou un redirect vers le frontend.

---

## Option 2 : IP publique + Nginx + Let's Encrypt (sans domaine)

Si tu n'as pas de domaine, tu peux utiliser l'IP publique du VPS avec un certificat Let's Encrypt via le challenge DNS-01... mais ça nécessite quand même un domaine.

### Alternative sans domaine : IP + certificat auto-signé
- Les testeurs auront un avertissement SSL dans le navigateur
- Cliquer "Avancé → Accepter le risque" pour continuer
- Pas idéal pour une démo propre

### Avec un sous-domaine gratuit (ex: duckdns.org)
- https://www.duckdns.org/ fournit un sous-domaine gratuit (ex: `myapp.duckdns.org`)
- Let's Encrypt peut générer un cert valide via le challenge DNS
- Ça prend 5 min de plus que Cloudflare Tunnel

### Config nginx
Voir `nginx.conf` dans ce dossier.

### Certbot
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d vote.mondomaine.xyz
# Renouvellement auto via cron/systemd
```

---

## Vérification finale

```bash
# Sur le VPS
systemctl status fhevm-hardhat fhevm-relayer fhevm-frontend
curl -s http://localhost:8080/api/contract | python3 -m json.tool
```

```bash
# Depuis ton Mac
curl -s https://vote.mondomaine.xyz/api/contract
```

Les deux doivent retourner le même `address` et `admin`.
