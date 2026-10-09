# Go

Tags as in `CODING_STANDARDS.md`. Standard library first; add a dependency only when it removes real complexity.

- `tool` Latest stable Go, `go.mod` pins it. `go test ./...` to test, `gofmt`/`goimports` to format (no style debates). _(formatter, go.mod check)_
- `tool` `go vet` and `golangci-lint` clean; `errcheck` on, so no ignored errors. _(golangci-lint)_
- `tool` Handle errors as values: return `error` last, wrap with context (`fmt.Errorf("load listing %d: %w", id, err)`), compare with `errors.Is`/`errors.As`. No `panic` outside `main` and impossible states. _(errcheck, forbidigo for panic)_
- `review` Sentinel errors or custom error types for control flow that must unwind (`var ErrQuotaExhausted = errors.New("quota exhausted")`), matched with `errors.Is`. Fatal vs transient follows `Resilience`.
- `tool` `context.Context` is the first parameter of anything that does I/O or can block; never store it in a struct. Timeouts and cancellation flow through it. _(contextcheck, noctx)_
- `tool` Packages are lowercase single words, grouped by feature under `internal/`. Callers outside a package use only its exported names; no `util`, `common` or `helpers` packages. Entry points live in `cmd/<name>/main.go`. _(depguard, revive var-naming)_
- `tool` `internal/` for everything not meant for other modules. Domain packages never import `cmd/`; no import cycles (the compiler enforces cycles). _(depguard)_
- `tool` Keep heavy or side-effecting packages (DB pools, HTTP servers, LLM SDKs) out of packages that pure logic imports; expose them from their own adapter package. No `init()` with side effects, no package-level clients. _(depguard, gochecknoinits, gochecknoglobals)_
- `review` Define interfaces where they are consumed, small (1 to 3 methods), only at I/O boundaries. Accept interfaces, return structs. Implicit satisfaction means a fake is a few lines in the `_test.go`.
- `tool` Ambient state (`os.Getenv`, `time.Now`, `rand`, `http.DefaultClient`) is read only in `cmd/` and `internal/config`. Everything else takes it as a parameter or an injected `Clock`/`Delay`. _(forbidigo)_
- `tool` Real sleeps go through the injectable delay; no `time.Sleep` elsewhere. _(forbidigo)_
- `tool` Parse external data (JSON, env, LLM output) into typed structs at the boundary: `json.Decoder` with `DisallowUnknownFields` where the schema is ours, then validate. No `map[string]any` past the boundary. _(forbidigo for `map[string]any` in domain packages as hint)_
- `review` Zero values should be useful. Constructors (`NewX`) only when a zero value can't be valid. Prefer plain structs and functions over types with methods that hide state.
- `review` Concurrency: every goroutine has an owner that waits for it (`errgroup`) and a way to stop (context). Bounded workers, no fire-and-forget. Share by communicating; guard the rest with the narrowest mutex.
- `tool` Unit tests are siblings: `foo.go` + `foo_test.go`; integration/e2e under `tests/`. Table-driven tests with `t.Run` named as sentences; `t.Helper()` in helpers; `t.Parallel()` where tests share no state. _(script, paralleltest as hint)_
- `tool` Generated code (`sqlc`, `templ`, `stringer`) is committed, marked `Code generated ... DO NOT EDIT.`, never hand-edited; CI regenerates and runs `git diff --exit-code`. _(generate + diff check)_

## Enforcement (wire into CI)

Go has no shared `@k-b3r/agent-config` package yet; a repo carries its own `.golangci.yml` and records it in its `CODING_STANDARDS.md`. Until `/init-repo` has a Go template, wire these by hand.

| Rule | Check |
|---|---|
| format, vet, ignored errors, ctx misuse, global state, `init()`, naming | `golangci-lint` (`gofmt`, `goimports`, `govet`, `errcheck`, `contextcheck`, `noctx`, `gochecknoinits`, `gochecknoglobals`, `revive`) |
| ambient env/clock/sleep outside entry points, `panic`, `map[string]any` | `forbidigo` with path-scoped exclusions for `cmd/` and `internal/config` |
| module boundaries, heavy deps only via their adapter, domains never import `cmd/` | `depguard` |
| size/params/complexity smells (`hint`) | `gocyclo`, `funlen`, `revive` as warnings |
| generated files in sync | `sqlc diff`, `templ generate` + `git diff --exit-code` |
| dead code | `unused` (via golangci-lint), `deadcode` |
| vulnerable deps | `govulncheck` |
| secrets | gitleaks |
| canonical check before push | lefthook pre-push runs `make check` (fmt, lint, vet, unit tests) |

- Each custom `forbidigo`/`depguard` rule gets a violating fixture plus a clean control, so a mis-scoped path can't silently check nothing.
- Adopt rules on existing code by ratchet: block new violations, fix old ones when touching the code.
