#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
sudo cp "$ROOT/nginx-agent1.conf" /etc/nginx/sites-available/agent1
sudo nginx -t
sudo systemctl reload nginx
echo "OK: http://164.92.196.100/frontend  and  http://164.92.196.100/backend"
