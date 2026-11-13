# pi-sync

Back up cleaned Pi sessions from every device to Google Drive, and read them on the home PC.

- `SETUP.md`: add a new device (Ubuntu, Termux).
- `SPEC.md`: running spec. Update it when behaviour changes.
- `DECISIONS.md`: decision log. Append, never rewrite.
- Code: `scripts/pi-push.mjs` (tests: `scripts/pi-push.test.mjs`).

Flow: each device runs `pi-push.mjs` from cron. It stages a cleaned copy of its sessions and runs `rclone copy` to `gdrive:agent-work/pi/<device>/`. The PC pulls the other devices' folders into `~/pi-sync/<device>/` (not built yet).
