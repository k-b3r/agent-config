# pi-sync

Back up cleaned Pi sessions from every device to Google Drive, and read them on the home PC.

- `SETUP.md`: add a new device (Ubuntu, Termux).
- `SPEC.md`: running spec. Update it when behaviour changes.
- `DECISIONS.md`: decision log. Append, never rewrite.
- Code: `scripts/pi-sync.mjs` (the `pi-sync` command; tests: `scripts/pi-sync.test.mjs`), `scripts/pi-push.mjs` (tests: `scripts/pi-push.test.mjs`), `scripts/pi-push-termux.sh` (Termux scheduler wrapper).

Flow: each device runs the push on a schedule (cron on Linux, Android JobScheduler on Termux, through `scripts/pi-push-termux.sh`). It stages a cleaned copy of its sessions and runs `rclone copy` to `gdrive:agent-work/pi/<device>/`. The PC pulls the other devices' folders into `~/pi-sync/<device>/` with `pi-sync pull` (at most once a day).

`pi-sync` is linked into `~/.local/bin` by agent-config's `install.sh` (and kept current by `config-sync`):
```
pi-sync push                 publish this device's sessions (guards: 60 min quiet, 12 h minimum)
pi-sync pull                 mirror the other devices into ~/pi-sync/<device>/ (rclone copy, never sync)
pi-sync run                  push, then pull
pi-sync schedule [push|run]  install the hourly cron entry (--print shows it). Linux devices: `push`; the PC: `run`
```
