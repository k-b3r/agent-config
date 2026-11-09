// Extra bash output states for small screens. Alt+O cycles the collapsed view:
//   normal (built-in 5 lines) -> compact (last 3 lines + Took) -> hidden (while running it looks like compact; once finished it collapses to one line: command and output hidden, + Took).
// Ctrl+O still expands to the full output as usual (it also peeks past "hidden"). Only renderResult is overridden; execution is
// the built-in tool. Revert: delete or rename this file, then /reload.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const PREVIEW_LINES = 3;

function duration(ms: number): string {
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	const t = Math.floor(s);
	const m = Math.floor(t / 60);
	if (m < 60) return `${m}m ${t % 60}s`;
	return `${Math.floor(m / 60)}h ${m % 60}m ${t % 60}s`;
}

export default function (pi: ExtensionAPI) {
	const original = createBashToolDefinition(process.cwd());
	const modes = ["normal", "compact", "hidden"] as const;
	let mode: (typeof modes)[number] = "normal";

	pi.registerShortcut("alt+o", {
		description: "Cycle bash output: normal / compact / hidden",
		handler: async (ctx) => {
			mode = modes[(modes.indexOf(mode) + 1) % modes.length];
			const was = ctx.ui.getToolsExpanded();
			ctx.ui.setToolsExpanded(!was);
			ctx.ui.setToolsExpanded(was);
			ctx.ui.notify(`Bash output: ${mode}`);
		},
	});

	pi.registerTool({
		...original,
		renderCall(args, theme, context) {
			// Always run the built-in call renderer: it starts the row's timer.
			const call = original.renderCall!(args, theme, context);
			if (mode === "hidden" && !context.isPartial && !context.expanded) return { invalidate() {}, render: () => [] };
			return call;
		},
		renderResult(result, options, theme, context) {
			if (options.expanded || mode === "normal") {
				return original.renderResult!(result, options, theme, context);
			}

			const state = context.state as Record<string, any>;
			if (options.isPartial && state.startedAt !== undefined && !state.compactTimer) {
				state.compactTimer = setInterval(() => context.invalidate(), 1000);
			}
			if (!options.isPartial) state.endedAt ??= Date.now();
			if (!options.isPartial && state.compactTimer) {
				clearInterval(state.compactTimer);
				state.compactTimer = undefined;
			}

			const raw = result.content
				.filter((c) => c.type === "text")
				.map((c) => (c as { text: string }).text)
				.join("\n")
				.replace(/\r/g, "")
				.replace(/\t/g, "  ")
				.trim();
			const hidden = mode === "hidden" && !options.isPartial;
			const tail = hidden ? [] : raw ? raw.split("\n").slice(-PREVIEW_LINES) : [];

			let timer: string | undefined;
			if (!options.isPartial && context.durationMs !== undefined) {
				timer = `Took ${duration(context.durationMs)}`;
			} else if (state.startedAt !== undefined) {
				const label = options.isPartial ? "Elapsed" : "Took";
				timer = `${label} ${duration((state.endedAt ?? Date.now()) - state.startedAt)}`;
			}

			return {
				invalidate() {},
				render(width: number): string[] {
					if (hidden) {
						return [theme.fg("muted", `(hidden command${timer ? ` · ${timer}` : ""})`)];
					}
					const lines = tail.map((l) => truncateToWidth(theme.fg("toolOutput", l), width));
					if (lines.length) lines.unshift("");
					if (timer) lines.push("", theme.fg("muted", timer));
					return lines;
				},
			};
		},
	});
}
