---
name: ticket-held-findings
description: Turns the repo's held-findings list (small out-of-scope smells and tidy-ups parked for grouping) into tracker tickets. Applies the cap rule (max 10 held, a group of 3 related items is ticketed, nothing waits past 14 days, bugs are never held), folds items into fitting open tickets instead of duplicating, files grouped tickets with source and "Done when", then clears what it filed. Use when user runs /ticket-held-findings, asks to "file the held findings", "ticket the todos", "flush findings", or when adding a finding would break the cap.
---

# Ticket held findings

The coding standard lets small out-of-scope findings wait in a held list so related ones become one ticket instead of five. This skill enforces the cap and does the filing. The tracker is the backlog; the held list is only a short queue in front of it.

Input: optional `--all` (file everything, cap or not) or a group name to file just that group.

## 1. Locate

- **Held list:** the path the repo's `CODING_STANDARDS.md` names for held findings; default the `## Held findings` section of `TODOS.md` at the repo root (often local only, in `.git/info/exclude`).
- **Tracker:** whatever the repo's `CODING_STANDARDS.md` / `CLAUDE.md` names, and any scope rule in memory (e.g. one team or board only). Linear MCP, `gh issue`, etc. Unreachable or not loaded: stop and say so; don't file elsewhere.

Item format in the list (add date and source when you move items in, so the age rule works):

```
Group heading:

- (2026-10-05, BUY-23 #24) `path:line` problem, and the fix if known.
```

Items without a date count as older than 14 days.

## 2. Decide what files now

Cap rule (same as `CODING_STANDARDS.md`, Workflow):

| Trigger | Action |
|---|---|
| Item is a bug a user could hit | File now, on its own; it should never have been held |
| A group has 3+ related items | File the group as one ticket |
| Item older than 14 days | File it (with its group, or alone) |
| List would exceed 10 items | File the largest groups until it's at 10 or fewer |
| `--all` | File everything |

Everything else stays held. Groups are by area a single PR could fix (same module or same kind of change), not by who found them.

## 3. Fold into existing tickets first

Before creating anything, list open tickets in the tracker (same team or board) and match each item due for filing:
- Fits an open ticket's scope (same files, same fix): append it there as a bullet, with source and date (`From BUY-33 (#32, 2026-10-06): ...`). No new ticket.
- Fits a ticket already in progress: append only if the PR is not yet open; otherwise new ticket.
- No fit: goes into a new grouped ticket.

## 4. Write the tickets

One ticket per group, in the repo's ticket voice (read two recent tickets first):

- **Title:** the change, not the list (`Script wiring and logging cleanup in utils`), not `Misc findings`.
- **Body:** `Found by:` the sources and dates, then one bullet per item (`path:line`, problem, fix), then `Done when:` a checkable line (tests where behavior changes).
- **Labels and priority:** the tracker's existing vocabulary. Smells and tidy-ups are low; a bug a user could hit is at least medium.

Show the plan before writing: groups, target ticket (new or existing id), items. Ask once with AskUserQuestion (file as planned, adjust, or cancel). Then create or update, and print each ticket id and title.

## 5. Clear the list

Remove every filed item from the held list. Leave unfiled items with their dates. If the held-findings section is empty, leave the heading with `(none; filed into <ids> on <date>)`.

## Rules

- File only items the cap rule (or `--all`, or the user) selects; don't empty the list for neatness.
- Never hold a bug: if you find one in the list, file it now even if nothing else is due.
- Don't fix anything here; filing only.
- Memory and notes are not a backlog: never move items there instead of the tracker.

## Report

```
Filed: BUY-43 Curated catalog and pricing data cleanup (3 items)
       BUY-44 Script wiring and logging cleanup (5 items)
Folded: 2 items into BUY-35, 1 into BUY-38
Held: 2 items (newest 2026-10-06, oldest 2026-10-02)
```
