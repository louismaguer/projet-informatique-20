#!/bin/bash
# scripts/cloudflared_tunnel.sh
#
# Helper partagé pour démarrer un tunnel Cloudflare *quick* (URL aléatoire
# *.trycloudflare.com) en forçant --protocol http2 (TCP/7844) et en
# empêchant les instances concurrentes sur le même port.
#
# Pourquoi --protocol http2 :
#   QUIC (UDP/7844) est souvent bloqué par les NAT/firewalls. cloudflared
#   ne retombe pas automatiquement sur HTTP/2 même si le pre-check le suggère,
#   ce qui produit l'erreur Cloudflare 1033 côté client.
#
# Usage : sourcer ce fichier, puis appeler la fonction.
#   source "$(dirname "${BASH_SOURCE[0]}")/cloudflared_tunnel.sh"
#   start_cloudflared_quick_tunnel 8080
#
# Effets de bord après un appel réussi :
#   - PUBLIC_URL  : URL publique (vide si non prête)
#   - TUNNEL_PID  : PID du cloudflared lancé
#   - stdout      : "PUBLIC_URL=<url>"  (une ligne, facile à grepper)

if [ -n "${CLOUDFLARED_TUNNEL_HELPER_LOADED:-}" ]; then
    return 0
fi
CLOUDFLARED_TUNNEL_HELPER_LOADED=1

# Affiche l'état d'un tunnel cloudflared tournant sur $port, propose de le
# tuer, et agit selon la réponse de l'utilisateur. Renvoie 0 si rien ne
# tourne (ou après kill), 1 si l'utilisateur a annulé.
_handle_existing_tunnel() {
    local port="$1"
    local existing
    existing=$(ps -eo pid=,command= | awk -v port="$port" \
        '$2 ~ /cloudflared/ && $0 ~ ("localhost:" port) && $1 != "" {print $1}' \
        | grep -v "^$$\$" || true)
    if [ -z "$existing" ]; then
        return 0
    fi

    echo "⚠️  Un tunnel cloudflared tourne déjà sur le port $port :"
    ps -o pid,etime,command -p "$existing" 2>/dev/null | sed 's/^/   /'
    echo ""
    echo "   Pour le redémarrer proprement, tue-le d'abord :"
    echo "     kill $existing"
    echo ""

    local reply
    read -p "   Le tuer maintenant et continuer ? [o/N] " reply
    case "$reply" in
        [oOyY])
            kill $existing 2>/dev/null || true
            sleep 1
            if kill -0 $existing 2>/dev/null; then
                kill -9 $existing 2>/dev/null || true
                sleep 1
            fi
            echo "   ✅ Ancien tunnel arrêté."
            echo ""
            return 0
            ;;
        *)
            echo "   ❌ Annulé. Relance manuelle après avoir tué l'ancien tunnel."
            return 1
            ;;
    esac
}

# Démarre un tunnel cloudflared quick sur $port (défaut 8080).
# Args :
#   $1 : port (défaut 8080)
#   $2 : chemin du fichier de log (défaut /tmp/cloudflared-tunnel.log)
# Renvoie 0 si l'URL trycloudflare a été trouvée, 1 sinon.
start_cloudflared_quick_tunnel() {
    local port="${1:-8080}"
    local log="${2:-/tmp/cloudflared-tunnel.log}"

    if ! command -v cloudflared > /dev/null 2>&1; then
        echo "❌ cloudflared non installé (brew install cloudflared)" >&2
        return 1
    fi

    if ! _handle_existing_tunnel "$port"; then
        return 1
    fi

    : > "$log"
    # --protocol http2 : force TCP/7844 (cf. commentaire en tête du fichier)
    cloudflared tunnel --url "http://localhost:$port" --no-autoupdate \
        --protocol http2 > "$log" 2>&1 &
    TUNNEL_PID=$!

    # Attend l'URL publique (max 30s)
    local url=""
    for _ in $(seq 1 30); do
        sleep 1
        url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" 2>/dev/null | head -1 || true)
        if [ -n "$url" ]; then
            break
        fi
    done

    if [ -n "$url" ]; then
        PUBLIC_URL="$url"
        echo "PUBLIC_URL=$url"
        return 0
    fi

    PUBLIC_URL=""
    echo "⚠️  Tunnel cloudflared lancé (PID $TUNNEL_PID) mais aucune URL trycloudflare.com détectée en 30s." >&2
    echo "   Voir : tail -f $log" >&2
    return 1
}