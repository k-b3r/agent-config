// Claude subscription usage: footer status while an Anthropic model is active, plus /usage.
// Source: GET api.anthropic.com/api/oauth/usage (undocumented; may change).
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const URL = "https://api.anthropic.com/api/oauth/usage";
const MIN_REFETCH_MS = 60_000;
// Switch to FALLBACK when the 5-hour window reaches this percent. 0 disables.
const THRESHOLD = Number(process.env.CLAUDE_FALLBACK_THRESHOLD ?? 95);
const RESUME_MARGIN = 5; // switch back once usage drops this far below threshold
const FALLBACK = { provider: "opencode-go", id: "deepseek-v4.1-flash" };

interface Window {
	utilization: number | null;
	resets_at: string | null;
}
interface Usage {
	five_hour?: Window | null;
	seven_day?: Window | null;
	seven_day_opus?: Window | null;
	seven_day_sonnet?: Window | null;
}

function remaining(iso: string | null | undefined): string {
	if (!iso) return "?";
	const ms = Date.parse(iso) - Date.now();
	if (ms <= 0) return "now";
	const m = Math.round(ms / 60_000);
	const d = Math.floor(m / 1440);
	const h = Math.floor((m % 1440) / 60);
	if (d > 0) return `${d}d${h}h`;
	if (h > 0) return `${h}h${m % 60}m`;
	return `${m}m`;
}

function pct(w: Window | null | undefined): string {
	return w?.utilization == null ? "?" : `${Math.round(w.utilization)}%`;
}

const fmtTokens = (n: number) =>
	n < 1000 ? `${n}` : n < 10000 ? `${(n / 1000).toFixed(1)}k` : n < 1e6 ? `${Math.round(n / 1000)}k` : `${(n / 1e6).toFixed(1)}M`;

export default function (pi: ExtensionAPI) {
	// Sub-agents are separate pi processes that each load this extension. Polling from all of them
	// at once trips the usage endpoint's rate limit (429), which blanks the main session's footer.
	// The harness sets PI_SUBAGENT_ID in every child, so only the main session polls.
	if (process.env.PI_SUBAGENT_ID) return;

	let usageText = "";
	let rerender: (() => void) | undefined;
	let previous: { provider: string; id: string } | undefined; // model we fell back from
	let cache: { at: number; data: Usage } | undefined;

	async function fetchUsage(ctx: ExtensionContext, force = false): Promise<Usage> {
		if (!force && cache && Date.now() - cache.at < MIN_REFETCH_MS) return cache.data;
		const token = await ctx.modelRegistry.getApiKeyForProvider("anthropic");
		if (!token) throw new Error("no anthropic credentials (run /login)");
		const res = await fetch(URL, {
			headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) throw new Error(`usage API ${res.status}`);
		const data = (await res.json()) as Usage;
		cache = { at: Date.now(), data };
		return data;
	}

	const peak = (u: Usage) => u.five_hour?.utilization ?? 0; // 5-hour window only

	async function applyFallback(ctx: ExtensionContext, u: Usage) {
		if (THRESHOLD <= 0) return;
		const p = peak(u);
		if (ctx.model?.provider === "anthropic" && p >= THRESHOLD) {
			const target = ctx.modelRegistry.find(FALLBACK.provider, FALLBACK.id);
			if (!target) return;
			const from = { provider: ctx.model.provider, id: ctx.model.id };
			if (await pi.setModel(target)) {
				previous = from;
				ctx.ui.notify(`Claude at ${Math.round(p)}%, switched to ${FALLBACK.id} (resets in ${remaining(u.five_hour?.resets_at)})`, "warning");
			}
		} else if (previous && ctx.model?.id === FALLBACK.id && p < THRESHOLD - RESUME_MARGIN) {
			const back = ctx.modelRegistry.find(previous.provider, previous.id);
			if (back && (await pi.setModel(back))) {
				ctx.ui.notify(`Claude limit recovered (${Math.round(p)}%), back on ${previous.id}`, "info");
				previous = undefined;
			}
		} else if (previous && ctx.model?.id !== FALLBACK.id) {
			previous = undefined; // user picked a model manually
		}
	}

	async function refreshStatus(ctx: ExtensionContext) {
		usageText = "";
		if (ctx.model?.provider === "anthropic" || previous) {
			try {
				const u = await fetchUsage(ctx);
				await applyFallback(ctx, u);
				if (ctx.model?.provider === "anthropic") {
					usageText = `5h ${pct(u.five_hour)} (${remaining(u.five_hour?.resets_at)}) · 7d ${pct(u.seven_day)} (${remaining(u.seven_day?.resets_at)})`;
				}
			} catch {
				// leave empty
			}
		}
		rerender?.();
	}

	// Same layout as pi's default footer, with usage right-aligned on the path line (above the model label).
	function installFooter(ctx: ExtensionContext) {
		ctx.ui.setFooter((tui, theme, footerData) => {
			rerender = () => tui.requestRender();
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose() {
					unsub();
					rerender = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					const pathLine = (cwd: string, w: number, th: typeof theme) => {
						if (!usageText) return truncateToWidth(th.fg("dim", cwd), w, th.fg("dim", "..."));
						const uw = visibleWidth(usageText);
						const left = truncateToWidth(cwd, Math.max(0, w - uw - 2), "...");
						const gap = " ".repeat(Math.max(1, w - visibleWidth(left) - uw));
						return th.fg("dim", left + gap + usageText);
					};
					let input = 0,
						output = 0,
						cacheRead = 0,
						cost = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							input += m.usage.input;
							output += m.usage.output;
							cacheRead += m.usage.cacheRead;
							cost += m.usage.cost.total;
						}
					}
					const cu = ctx.getContextUsage();
					const win = cu?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const pctVal = cu?.percent ?? 0;
					const ctxStr = `${cu?.percent == null ? "?" : pctVal.toFixed(1) + "%"}/${fmtTokens(win)}`;
					const ctxColored = pctVal > 90 ? theme.fg("error", ctxStr) : pctVal > 70 ? theme.fg("warning", ctxStr) : ctxStr;

					const parts: string[] = [];
					if (input) parts.push(`↑${fmtTokens(input)}`);
					if (output) parts.push(`↓${fmtTokens(output)}`);
					if (cacheRead) parts.push(`R${fmtTokens(cacheRead)}`);
					if (cost) parts.push(`$${cost.toFixed(3)}`);
					parts.push(ctxColored);
					const left = parts.join(" ");

					let model = ctx.model?.id ?? "no-model";
					if (ctx.model?.reasoning) {
						const lvl = pi.getThinkingLevel();
						model += lvl === "off" ? " • thinking off" : ` • ${lvl}`;
					}
					const right = model;

					let cwd = ctx.cwd;
					const home = process.env.HOME;
					if (home && cwd.startsWith(home)) cwd = "~" + cwd.slice(home.length);
					const branch = footerData.getGitBranch();
					if (branch) cwd += ` (${branch})`;

					const room = width - visibleWidth(left) - 2;
					const r = visibleWidth(right) <= room ? right : truncateToWidth(right, Math.max(0, room), "");
					const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(r)));
					const lines = [
						pathLine(cwd, width, theme),
						theme.fg("dim", left) + theme.fg("dim", pad + r),
					];
					const statuses = [...footerData.getExtensionStatuses().entries()]
						.sort(([x], [y]) => x.localeCompare(y))
						.map(([, t]) => t.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim());
					if (statuses.length) lines.push(truncateToWidth(statuses.join(" "), width, theme.fg("dim", "...")));
					return lines;
				},
			};
		});
	}

	pi.on("session_start", (_e, ctx) => {
		installFooter(ctx);
		void refreshStatus(ctx);
	});
	pi.on("model_select", (_e, ctx) => void refreshStatus(ctx));
	// Check before each prompt so the switch happens before the request goes out.
	pi.on("before_agent_start", async (_e, ctx) => {
		await refreshStatus(ctx);
	});
	pi.on("turn_end", (_e, ctx) => void refreshStatus(ctx));

	pi.registerCommand("usage", {
		description: "Show Claude subscription usage limits and time until reset",
		handler: async (_args, ctx) => {
			try {
				const u = await fetchUsage(ctx, true);
				const rows: [string, Window | null | undefined][] = [
					["5-hour session", u.five_hour],
					["7-day all models", u.seven_day],
					["7-day Opus", u.seven_day_opus],
					["7-day Sonnet", u.seven_day_sonnet],
				];
				const lines = rows
					.filter(([, w]) => w)
					.map(([name, w]) => `${name.padEnd(18)} ${pct(w).padStart(4)}  resets in ${remaining(w!.resets_at)}`);
				ctx.ui.notify(lines.join("\n") || "no usage data", "info");
				await refreshStatus(ctx);
			} catch (err) {
				ctx.ui.notify(`usage: ${(err as Error).message}`, "error");
			}
		},
	});
}
