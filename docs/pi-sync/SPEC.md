# pi-sync spec (running)

Status: push script done and verified on laptop (393 files, 75.6 MiB). Scheduled on Termux from Android JobScheduler every 6 h; the first run is immediate, later runs follow Android's batching (Xiaomi/HyperOS can stop the job; D20). Everything else below "Planned" is not built.

## Goal
Every device uploads a cleaned, truncated copy of its Pi sessions to Drive. The PC reads them from Drive. Raw originals are never modified.

## Drive layout
`gdrive:agent-work/pi/<device>/<pi-folder>/<timestamp>_<id>.jsonl`. `<pi-folder>` is Pi's flattened cwd name, kept raw (decision D9). Exact `cwd` is in each file's header line.

## Push (`scripts/pi-push.mjs`, built)
1. Sessions dir: `PI_SRC` > `PI_CODING_AGENT_SESSION_DIR` > `$PI_CODING_AGENT_DIR/sessions` > `~/.pi/agent/sessions`. Exit 1 if missing.
2. Only `.jsonl` files under it (allowlist; `auth.json` etc. never staged).
3. Run when: newest file older than `QUIET_MIN`, AND stamp missing or older than `MIN_HOURS`, AND newest file newer than stamp.
4. Stage a cleaned copy in a temp dir, keeping source mtimes. Remove it in `finally`.
5. `rclone copy` to `<RCLONE_REMOTE>/<DEVICE>`. Never `sync`.
6. Stamp (`~/.local/state/pi-push.stamp`) mtime = run start, only after rclone exits 0.
7. Scheduled per device: cron hourly on Linux; on Termux `scripts/pi-push-termux.sh` from Android JobScheduler every 6 h (no crond, no wake lock). The wrapper takes the device name from `~/.config/pi-push/device`, holds a `flock` so runs never overlap, and appends to `~/pi-push.log` (rotated at 1 MiB).

### Cleaning, per line
| Line | Treatment |
|---|---|
| blank, unparsable | pass through unchanged |
| `session` header | keep |
| `user` | keep; strings capped at `MAX_CHARS` |
| `assistant` | keep text, thinking, toolCall; drop `thinkingSignature`; capped at `MAX_CHARS` |
| `bashExecution`, `toolResult` | keep; strings capped at `RESULT_CHARS`; images become `{type:"image",omitted:true}`; `details` dropped |
| everything else (`system`, `custom`, `compaction`, `model_change`, ...) | dropped |

Order per string: mask secrets, then truncate (`…[truncated N]`, by code points). Truncation is per message, not per session.

Secret masking to `[REDACTED]`: private-key blocks, JWTs, `Bearer ...`, `sk-...`, `ghp_/gho_/...`, `AKIA...`, and `<name containing token|secret|api_key|_key|password>=value`.

Measured on 393 sessions: 245 MB in, 75.6 MiB out. 32 of 14,437 thinking blocks exceed 20k chars (2.4% of thinking text); kept head-only (D10).

## Planned (not built)
- Cron install for laptop/pc, failure alert.
- `pi-pull-all` on the PC: `rclone copy` other devices' folders into `~/pi-sync/<device>/`, daily. Archive only; not loaded into Pi (D6).
- Topic chunking of sessions into themes (prototype in `personal-dashboard/proto`, not in this repo). See below.

## Chunking design (prototype stage)
- Unit: turn = user message + following assistant output.
- Classifier: Jev (`jev-1.13`, paid) with a 3-way choice `same | related | new`; keep all three probabilities per turn so thresholds can be retuned offline.
- Window: prototype used 3 turns x 200 chars; planned richer (5 turns, 500+ chars, one-line tool-call summaries). Quality first (D13).
- Threshold: 0.7 on `new` worked on topic-hopping sessions, too coarse on long single-project ones. Candidate 0.45 with min chunk 6 turns; not validated live (free quota hit).
- DeepSeek vs Jev on 73 shared windows: 94% agree at 0.7, 89% at 0.5, correlation 0.58. No ground truth yet.
- Next: hand-label ~60 turns, score both models, tune. DeepSeek as second opinion only.
- Sidecar output: `<session>.chunks.json` (line ranges, raw scores, prompt version).

## Open questions
- Do `related` turns create sub-chunks (two-level) or stay in the parent chunk?
- Where does the chunker run (PC only)? Which repo?
- Termux: Pi session path, rclone token paste, whether `QUIET_MIN=60` suits phones.
- Add failure alert?
- Commit this to agent-config (done in #104).
