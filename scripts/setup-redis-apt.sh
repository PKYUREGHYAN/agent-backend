#!/usr/bin/env bash
set -euo pipefail
if ! command -v redis-server >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y redis-server
fi
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf || true
# bind localhost only (default)
sudo systemctl enable redis-server
sudo systemctl restart redis-server
redis-cli ping
echo "OK: redis-server running"
