import { A as TrialManifestSchema, B as authorId, C as RecordedErrorSchema, D as RunSummarySchema, E as RunStatusSchema, F as canonicalParameters, H as resourceUri, I as defineEvalMatrix, L as ResourceKindSchema, M as TrialScoringSchema, N as TrialSummarySchema, O as ScoreResultSchema, P as UsageSchema, R as ResourceUriSchema, S as JudgeRunInfoSchema, T as RunMetadataSchema, U as resourceUriSchema, V as parseResourceUri, W as resourceUuid, _ as ApiErrorSchema, a as defineSuite, b as CheckpointResultSchema, c as expectToolCall, d as judge, f as predicate, g as parseTrajectoryJsonl, h as user, i as defineEval, j as TrialMetadataSchema, k as TrajectoryEventSchema, l as file, m as registerEvals, n as authoringId, o as directory, p as recordError, r as defineAgent, s as dynamic, t as agent, u as inlineFile, v as ArtifactEntrySchema, w as RunManifestSchema, x as JsonValueSchema, y as AutIdentitySchema, z as UuidSchema } from "./src-D9EZ9WiG.mjs";
//#region ../core/src/config.ts
/** Pure, typed project configuration. Loading/discovery belongs to the CLI. */
function defineConfig(configuration) {
	return configuration;
}
//#endregion
//#region ../agents/src/index.ts
/** A local, one-prompt-per-turn AUT backed by Pi's non-interactive print mode. */
function piAgent(options = {}) {
	const command = options.command ?? "pi";
	return defineAgent({
		identity: {
			name: "Pi Agent",
			kind: "process",
			id: "pi-agent"
		},
		runtimes: { local: {
			kind: "process",
			configuration: { command }
		} },
		async start({ context, onEvent }) {
			await onEvent({
				kind: "started",
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
			let turn = 0;
			return {
				async send(message) {
					turn += 1;
					await onEvent({
						kind: "turn-started",
						turn,
						timestamp: (/* @__PURE__ */ new Date()).toISOString()
					});
					const process = Bun.spawn([
						command,
						"--print",
						"--no-session",
						"--no-tools",
						...options.args ?? [],
						message
					], {
						cwd: context.workspace.root,
						stdout: "pipe",
						stderr: "pipe"
					});
					const [stdout, stderr, exitCode] = await Promise.all([
						new Response(process.stdout).text(),
						new Response(process.stderr).text(),
						process.exited
					]);
					if (exitCode !== 0) throw new Error(`Pi exited with ${exitCode}: ${stderr.trim()}`);
					await onEvent({
						kind: "message",
						role: "assistant",
						content: stdout.trim(),
						timestamp: (/* @__PURE__ */ new Date()).toISOString()
					});
					await onEvent({
						kind: "turn-completed",
						turn,
						timestamp: (/* @__PURE__ */ new Date()).toISOString()
					});
				},
				async close() {
					await onEvent({
						kind: "completed",
						timestamp: (/* @__PURE__ */ new Date()).toISOString()
					});
				}
			};
		}
	});
}
//#endregion
export { ApiErrorSchema, ArtifactEntrySchema, AutIdentitySchema, CheckpointResultSchema, JsonValueSchema, JudgeRunInfoSchema, RecordedErrorSchema, ResourceKindSchema, ResourceUriSchema, RunManifestSchema, RunMetadataSchema, RunStatusSchema, RunSummarySchema, ScoreResultSchema, TrajectoryEventSchema, TrialManifestSchema, TrialMetadataSchema, TrialScoringSchema, TrialSummarySchema, UsageSchema, UuidSchema, agent, authorId, authoringId, canonicalParameters, defineAgent, defineConfig, defineEval, defineEvalMatrix, defineSuite, directory, dynamic, expectToolCall, file, inlineFile, judge, parseResourceUri, parseTrajectoryJsonl, piAgent, predicate, recordError, registerEvals, resourceUri, resourceUriSchema, resourceUuid, user };

//# sourceMappingURL=index.mjs.map