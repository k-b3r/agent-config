# Set up a new device

Needs: Node 22+, rclone, cron. Device names: `laptop`, `pc`, `tablet`, `phone` (one folder each on Drive; a device only writes its own).

## 1. Get the script
```sh
git clone https://github.com/k-b3r/agent-config ~/agent-config
```
Only `scripts/pi-push.mjs` is needed. No `pnpm install`: it uses Node built-ins only.

## 2. rclone remote `gdrive`
Scope `drive.file`, your own OAuth client. Check: `rclone lsd gdrive:agent-work`.
- Device with a browser: `rclone config`.
- No browser (Termux, server): run `rclone authorize "drive" "<client_id>" "<client_secret>"` on the laptop. Paste the token it prints into `rclone config` on the device. Never commit or log the token or `rclone.conf`.

## 3. Find the sessions dir
Default `~/.pi/agent/sessions`. Pi overrides, checked in this order by the script: `PI_SRC`, `PI_CODING_AGENT_SESSION_DIR`, `$PI_CODING_AGENT_DIR/sessions`. Check: `ls ~/.pi/agent/sessions`.

## 4. Test
```sh
DEVICE=<name> QUIET_MIN=0 DRY_RUN=1 node ~/agent-config/scripts/pi-push.mjs   # lists, writes nothing
DEVICE=<name> QUIET_MIN=0 node ~/agent-config/scripts/pi-push.mjs             # real push, sets stamp
rclone size gdrive:agent-work/pi/<name>
```

## 5. Schedule (hourly; the 12 h guard is in the script)
Use the absolute node path (`which node`; nvm users: `~/.local/share/nvm/<ver>/bin/node`).
```
0 * * * * DEVICE=<name> /abs/path/to/node $HOME/agent-config/scripts/pi-push.mjs >> $HOME/pi-push.log 2>&1
```

### Termux extras
```sh
pkg update && pkg install nodejs git rclone cronie termux-services
sv-enable crond            # then restart Termux
termux-wake-lock
```
- First line of the crontab: `PATH=/data/data/com.termux/files/usr/bin`
- Turn off battery optimisation for Termux.
- Optional: Termux:Boot with `~/.termux/boot/start-crond` containing `termux-wake-lock; crond`.
- Unverified on Termux: Pi session path, `rclone` token paste flow.

## Env vars
| Var | Default | Meaning |
|---|---|---|
| `DEVICE` | required | Drive folder name |
| `PI_SRC` | auto | Sessions dir |
| `MAX_CHARS` | 20000 | Cap per user/assistant string |
| `RESULT_CHARS` | 500 | Cap per tool result / bash output |
| `MIN_HOURS` | 12 | Min hours between pushes |
| `QUIET_MIN` | 60 | Skip run if any session changed within this many minutes |
| `RCLONE_REMOTE` | `gdrive:agent-work/pi` | Remote base |
| `DRY_RUN` | unset | `rclone --dry-run`, no stamp |

## Troubleshooting
- "nothing to do": a session changed in the last hour, the stamp is under 12 h old, or nothing is newer than the stamp. Stamp: `~/.local/state/pi-push.stamp`. Delete it to force a push.
- Cron does nothing: PATH or node path. Test the exact cron line by hand.
