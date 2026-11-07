#!/bin/sh
set -eu

directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! id -u el-bot-metrics >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin el-bot-metrics
fi
install -d -m 0755 /usr/local/lib/el-bot
install -m 0644 "$directory/host-metrics.py" /usr/local/lib/el-bot/host-metrics.py
install -m 0644 "$directory/el-bot-host-metrics.service" /etc/systemd/system/el-bot-host-metrics.service
install -m 0644 "$directory/el-bot-host-metrics.timer" /etc/systemd/system/el-bot-host-metrics.timer
systemd-analyze verify /etc/systemd/system/el-bot-host-metrics.service /etc/systemd/system/el-bot-host-metrics.timer
systemctl daemon-reload
systemctl start el-bot-host-metrics.service
systemctl enable --now el-bot-host-metrics.timer
