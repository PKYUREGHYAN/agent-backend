#!/usr/bin/env bash
set -euo pipefail
SWAPFILE=/swapfile
SIZE=2G
if swapon --show | grep -q "$SWAPFILE"; then
  echo "Swap already active: $SWAPFILE"
  swapon --show
  free -h
  exit 0
fi
if [ ! -f "$SWAPFILE" ]; then
  sudo fallocate -l "$SIZE" "$SWAPFILE" || sudo dd if=/dev/zero of="$SWAPFILE" bs=1M count=2048 status=progress
fi
sudo chmod 600 "$SWAPFILE"
sudo mkswap "$SWAPFILE"
sudo swapon "$SWAPFILE"
if ! grep -q "^$SWAPFILE " /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
# Milder swappiness for 2GB RAM droplet
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf >/dev/null
sudo sysctl -p /etc/sysctl.d/99-swap.conf
swapon --show
free -h
echo "OK: 2G swap enabled"
