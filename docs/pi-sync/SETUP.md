# Set up a new device

Needs: Node 22+, rclone, and a scheduler (cron on Linux, `termux-job-scheduler` on Termux). Device names: `laptop`, `pc`, `tablet`, `phone` (one folder each on Drive; a device only writes its own).

## 1. Get the script
```sh
git clone https://github.com/k-b3r/agent-config ~/agent-config
```
Only `scripts/pi-push.mjs` and `scripts/pi-push-termux.sh` are needed. No `pnpm install`: Node built-ins only. If the clone lives elsewhere, use that path in every command below.

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

## 5. Schedule

The script guards itself (60 min quiet, 12 h minimum), so the scheduler only has to call it.

### Linux: cron, hourly
Absolute node path (`which node`; nvm users: `~/.local/share/nvm/<ver>/bin/node`).
```
0 * * * * DEVICE=<name> /abs/path/to/node $HOME/agent-config/scripts/pi-push.mjs >> $HOME/pi-push.log 2>&1
```

### Termux (tablet, phone): Android JobScheduler, every 6 h
Do not use `crond` + `termux-wake-lock`: the lock is held 24/7, so the device never suspends, all to wake a script that no-ops 11 runs out of 12. `scripts/pi-push-termux.sh` hands the job to Android instead: no resident process, no wake lock, survives reboot, and Android batches the wakeups with whatever else it runs.

```sh
pkg install nodejs git rclone termux-api     # Termux:API app from F-Droid also required
mkdir -p ~/.config/pi-push && echo <name> > ~/.config/pi-push/device
~/agent-config/scripts/pi-push-termux.sh     # manual test: appends to ~/pi-push.log
termux-job-scheduler -s "$HOME/agent-config/scripts/pi-push-termux.sh" \
  --job-id 1 --period-ms 21600000 --network any --battery-not-low true --persisted true
termux-job-scheduler -p                      # list pending jobs
termux-job-scheduler --cancel-all            # stop it
```
- The wrapper reads the device name from `~/.config/pi-push/device`, so the same script serves every device.
- `--charging true` instead of `battery-not-low` if the device mostly sits on a charger.
- Doze may push a run past the 6 h mark; the 12 h guard makes that harmless.
- No wake lock, no `Termux:Boot`, no battery-optimization exemption needed.
- Log: `~/pi-push.log`, rotated to `.1` at 1 MiB. Lock: `$TMPDIR/pi-push-termux.lock`, so two runs never overlap.

## Env vars
| Var | Default | Meaning |
|---|---|---|
| `DEVICE` | required | Drive folder name |
| `PI_PUSH_DEVICE` | unset | Wrapper only: overrides `~/.config/pi-push/device` |
| `PI_PUSH_LOG` | `~/pi-push.log` | Wrapper only: log path |
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
- Termux job does nothing: `termux-job-scheduler -p` (registered?), `cat ~/pi-push.log`, and `termux-battery-status` (does the Termux:API app answer at all?).
