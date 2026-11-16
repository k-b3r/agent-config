#!/data/data/com.termux/files/usr/bin/sh
# Termux wrapper for pi-push.mjs, run by Android JobScheduler instead of cron:
# no crond, no termux-wake-lock, no resident process. One copy serves every
# Termux device; the device name lives in ~/.config/pi-push/device.
#
# Register (job ids are per device, so id 1 is fine on every device):
#   termux-job-scheduler -s $HOME/agent-config/scripts/pi-push-termux.sh \
#     --job-id 1 --period-ms 21600000 --network any --battery-not-low true --persisted true
# Check: termux-job-scheduler -p     Cancel: termux-job-scheduler --cancel-all
set -eu
PATH=/data/data/com.termux/files/usr/bin:$PATH
export PATH

DEVICE=${PI_PUSH_DEVICE:-$(cat "$HOME/.config/pi-push/device" 2>/dev/null || true)}
if [ -z "$DEVICE" ]; then
  echo "pi-push-termux: set the device name in ~/.config/pi-push/device" >&2
  exit 1
fi
export DEVICE

LOG=${PI_PUSH_LOG:-$HOME/pi-push.log}
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  mv "$LOG" "$LOG.1" # keep one old log; a silent unattended run must not fill the disk
fi

# -n: a slow upload must never stack a second run on top of it
exec 9>"${TMPDIR:-$HOME}/pi-push-termux.lock"
if ! flock -n 9; then
  printf '%s pi-push-termux: previous run still active, skipping\n' "$(date -u +%FT%TZ)" >>"$LOG"
  exit 0
fi

exec node "$(dirname "$0")/pi-push.mjs" >>"$LOG" 2>&1
