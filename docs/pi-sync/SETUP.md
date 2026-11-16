# Set up a new device

Needs: Node 22+, rclone, and a scheduler (cron on Linux, `termux-job-scheduler` on Termux). Device names: `laptop`, `pc`, `tablet`, `phone` (one folder each on Drive; a device only writes its own).

## 1. Get the script
On a device that already runs `config-sync` (agent-config and terminal-config cloned, `install.sh` run), `pi-sync` is already on the PATH: skip to step 2.

Otherwise:
```sh
git clone https://github.com/k-b3r/agent-config ~/agent-config
~/agent-config/install.sh      # links pi-sync into ~/.local/bin (needs ~/.local/bin on PATH)
```
Only `scripts/pi-sync.mjs`, `scripts/pi-push.mjs` and (Termux) `scripts/pi-push-termux.sh` are needed. No `pnpm install`: Node built-ins only. If the clone lives elsewhere, use that path in every command below.

## 2. rclone remote `gdrive`
Scope `drive.file`, your own OAuth client. Check: `rclone lsd gdrive:agent-work`.
- Device with a browser: `rclone config`.
- No browser (Termux, server): run `rclone authorize "drive" "<client_id>" "<client_secret>"` on the laptop. Paste the token it prints into `rclone config` on the device. Never commit or log the token or `rclone.conf`.

## 3. Find the sessions dir
Default `~/.pi/agent/sessions`. Pi overrides, checked in this order by the script: `PI_SRC`, `PI_CODING_AGENT_SESSION_DIR`, `$PI_CODING_AGENT_DIR/sessions`. Check: `ls ~/.pi/agent/sessions`.

## 4. Test
```sh
mkdir -p ~/.config/pi-push && echo <name> > ~/.config/pi-push/device
QUIET_MIN=0 DRY_RUN=1 pi-sync push     # lists, writes nothing
QUIET_MIN=0 pi-sync push               # real push, sets stamp
rclone size gdrive:agent-work/pi/<name>
FORCE=1 DRY_RUN=1 pi-sync pull         # the PC: lists what it would copy, writes nothing
```

## 5. Schedule

The script guards itself (60 min quiet, 12 h minimum), so the scheduler only has to call it.

### Linux: cron, hourly
```sh
pi-sync schedule         # push only
pi-sync schedule run     # the PC: push, then pull
pi-sync schedule --print # show the line without installing
crontab -l               # check
```
`schedule` writes the absolute node path (nvm safe) and a PATH that finds rclone, replaces only its own crontab line (marked `# pi-sync`) and logs to `~/pi-sync.log`. It also writes `~/.config/pi-push/device` when the name came from `DEVICE`, because the cron line carries none.

### Termux: Android JobScheduler, every 6 h
Do not use `crond` + `termux-wake-lock`: the lock is held 24/7, so the device never suspends, all to wake a script that no-ops 11 runs out of 12. `scripts/pi-push-termux.sh` hands the job to Android instead: no resident process, no wake lock, and the job is persisted across reboots. Android decides when it actually runs.

```sh
pkg install nodejs git rclone termux-api     # Termux:API app from F-Droid also required
mkdir -p ~/.config/pi-push && echo <name> > ~/.config/pi-push/device
~/agent-config/scripts/pi-push-termux.sh     # manual test: appends to ~/pi-push.log
termux-job-scheduler -s "$HOME/agent-config/scripts/pi-push-termux.sh" \
  --job-id 1 --period-ms 21600000 --network any --battery-not-low true --persisted true
termux-job-scheduler -p                      # check; can be stale or empty (termux-api#368)
termux-job-scheduler --cancel-all            # stop it
```
- The wrapper reads the device name from `~/.config/pi-push/device`, so the same script serves every device.
- `--charging true` instead of `battery-not-low` if the device mostly sits on a charger.
- The first run after registering is usually immediate. Later runs follow Android's batching and Doze, so a 6 h period can take longer; on some devices it is erratic (termux-api#742). The 12 h stamp guard makes late runs harmless.
- Xiaomi/HyperOS: set battery usage for both Termux and Termux:API to Unrestricted, and enable Autostart. Otherwise the OS can stop the job after its first run. Re-register if `~/pi-push.log` stops changing.
- No wake lock and no `Termux:Boot`.
- Log: `~/pi-push.log`, rotated to `.1` at 1 MiB. Lock: `$TMPDIR/pi-push-termux.lock`, so two runs never overlap.

## Env vars
| Var | Default | Meaning |
|---|---|---|
| `DEVICE` | required | Drive folder name |
| `PI_PUSH_DEVICE` | unset | Wrapper only: overrides `~/.config/pi-push/device` |
| `PI_SYNC_DIR` | `~/pi-sync` | `pi-sync pull`: mirror directory |
| `PULL_HOURS` | 24 | `pi-sync pull`: minimum hours between pulls |
| `FORCE` | unset | `pi-sync pull`: ignore the pull stamp |
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
- Cron does nothing: `crontab -l` shows the `# pi-sync` line? Run that exact line by hand and read `~/pi-sync.log`. Pull stamp: `~/.local/state/pi-pull.stamp` (delete it, or `FORCE=1`, to pull now).
- Termux job does nothing: `termux-job-scheduler -p` (can be stale; re-register), `cat ~/pi-push.log`, `termux-battery-status` (does the Termux:API app answer at all?), and battery usage Unrestricted for Termux and Termux:API on Xiaomi.
