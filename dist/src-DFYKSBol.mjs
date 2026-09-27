import { A as TrialManifestSchema, D as RunSummarySchema, F as canonicalParameters, H as resourceUri, M as TrialScoringSchema, N as TrialSummarySchema, O as ScoreResultSchema, T as RunMetadataSchema, b as CheckpointResultSchema, g as parseTrajectoryJsonl, j as TrialMetadataSchema, k as TrajectoryEventSchema, n as authoringId, p as recordError, w as RunManifestSchema, x as JsonValueSchema } from "./src-D9EZ9WiG.mjs";
import * as Schema from "effect/Schema";
import { Data, Effect, Either, Exit, Scope } from "effect";
import { appendFile, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path, { join } from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
//#region ../runner/src/errors.ts
var AutExecutionError = class extends Data.TaggedError("AutExecutionError") {};
var FixtureError = class extends Data.TaggedError("FixtureError") {};
var ReportError = class extends Data.TaggedError("ReportError") {};
var ScoringError = class extends Data.TaggedError("ScoringError") {};
var RuleExecutionError = class extends Data.TaggedError("RuleExecutionError") {};
var CheckpointExecutionError = class extends Data.TaggedError("CheckpointExecutionError") {};
//#endregion
//#region ../runner/src/snapshot.ts
/**
* Copies every regular file in the candidate workspace into the trial report.
* Symbolic links are rejected so snapshots cannot follow paths outside the trial.
*/
async function snapshotCandidateWorkspace(candidateRoot, writer) {
	const artifacts = [];
	async function visit(directory, relativeDirectory) {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const absolutePath = path.join(directory, entry.name);
			const relativePath = path.join(relativeDirectory, entry.name);
			const stat = await lstat(absolutePath);
			if (stat.isSymbolicLink()) throw new Error(`Candidate workspace contains a symbolic link: ${relativePath}`);
			if (stat.isDirectory()) {
				artifacts.push({
					path: path.join("candidate", relativePath),
					kind: "directory"
				});
				await visit(absolutePath, relativePath);
				continue;
			}
			if (!stat.isFile()) throw new Error(`Candidate workspace contains an unsupported entry: ${relativePath}`);
			const data = await readFile(absolutePath);
			const artifactPath = path.join("candidate", relativePath);
			await writer.writeArtifact(artifactPath, data);
			artifacts.push({
				path: artifactPath,
				kind: "file",
				size: data.byteLength
			});
		}
	}
	await visit(candidateRoot, "");
	return artifacts;
}
//#endregion
//#region ../runner/src/workspace.ts
const MAX_DYNAMIC_FIXTURE_DEPTH = 16;
function workspaceRoot(visibility, artifacts) {
	return visibility === "candidate" ? artifacts.candidate.root : artifacts.evaluator.root;
}
function destinationPath(root, destination) {
	if (!destination || path.isAbsolute(destination)) throw new Error(`Fixture destination must be a non-empty relative path: ${destination}`);
	const normalized = path.normalize(destination);
	if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error(`Fixture destination escapes its workspace: ${destination}`);
	return path.join(root, normalized);
}
async function resolveFixtures(fixtures, context, depth = 0) {
	if (depth > MAX_DYNAMIC_FIXTURE_DEPTH) throw new Error("Dynamic fixture nesting exceeds the supported depth");
	const resolved = [];
	for (const fixture of fixtures) {
		if (fixture.kind !== "dynamic") {
			resolved.push(fixture);
			continue;
		}
		const created = await fixture.create(context);
		const nested = Array.isArray(created) ? created : [created];
		resolved.push(...await resolveFixtures(nested, context, depth + 1));
	}
	return resolved;
}
function assertUniqueDestinations(fixtures) {
	const destinations = /* @__PURE__ */ new Set();
	for (const fixture of fixtures) {
		const destination = fixture.kind === "inline" ? fixture.file : fixture.dst;
		const key = `${fixture.visibility}:${destination}`;
		if (destinations.has(key)) throw new Error(`Duplicate ${fixture.visibility} fixture destination: ${destination}`);
		destinations.add(key);
	}
}
/** Creates isolated candidate and evaluator directories and materializes fixtures into each. */
function trialDirectoryName(trialId) {
	return trialId.replace(/[^a-zA-Z0-9._-]/g, "_");
}
async function createTrialWorkspace(context, fixtures = [], persistentRoot) {
	const root = persistentRoot ? path.join(path.resolve(persistentRoot), trialDirectoryName(context.trialId)) : await mkdtemp(path.join(os.tmpdir(), "evalkit-trial-"));
	const persistent = persistentRoot !== void 0;
	const artifacts = {
		candidate: { root: path.join(root, "candidate") },
		evaluator: { root: path.join(root, "evaluator") }
	};
	try {
		await Promise.all([mkdir(artifacts.candidate.root, { recursive: true }), mkdir(artifacts.evaluator.root, { recursive: true })]);
		const resolved = await resolveFixtures(fixtures, context);
		assertUniqueDestinations(resolved);
		for (const fixture of resolved) {
			const target = destinationPath(workspaceRoot(fixture.visibility, artifacts), fixture.kind === "inline" ? fixture.file : fixture.dst);
			await mkdir(path.dirname(target), { recursive: true });
			if (fixture.kind === "directory") await cp(fixture.src, target, {
				recursive: true,
				force: false,
				errorOnExist: true
			});
			else if (fixture.kind === "file") await copyFile(fixture.src, target);
			else await writeFile(target, fixture.data);
		}
		return {
			artifacts,
			cleanup: persistent ? async () => {} : () => rm(root, {
				recursive: true,
				force: true
			})
		};
	} catch (error) {
		await rm(root, {
			recursive: true,
			force: true
		});
		throw error;
	}
}
//#endregion
//#region ../runner/src/turn.ts
/** Freeze the observation window at send() completion, before checkpoint events arrive. */
function turnView(events, start, end, userStepIndex) {
	const window = events.slice(start, end);
	const autEvents = window.filter((event) => event.source === "aut");
	const assistantMessages = autEvents.filter((event) => event.kind === "message" && event.role === "assistant");
	const calls = window.flatMap((event, index) => event.source === "aut" && event.kind === "tool-call" ? [{
		event,
		eventIndex: start + index
	}] : []);
	const results = autEvents.filter((event) => event.kind === "tool-result");
	return {
		userStepIndex,
		events: autEvents,
		assistantMessages,
		toolCalls: calls.map(({ event, eventIndex }) => {
			const matches = results.filter((result) => result.id === event.id);
			const ambiguous = calls.filter((call) => call.event.id === event.id).length !== 1 || matches.length > 1;
			return {
				eventIndex,
				id: event.id,
				name: event.name,
				arguments: event.arguments,
				resultObservation: ambiguous ? "ambiguous" : matches.length ? "observed" : "absent",
				...!ambiguous && matches.length ? { result: matches[0].result } : {}
			};
		}),
		...typeof assistantMessages.at(-1)?.content === "string" ? { lastAssistantText: assistantMessages.at(-1).content } : {}
	};
}
/** Exact JSON matching: object keys do not matter, array order does. */
function matchingToolCall(turn, name, args) {
	const expected = args === void 0 ? void 0 : canonicalParameters(args);
	return turn.toolCalls.find((call) => call.name === name && (expected === void 0 || canonicalParameters(call.arguments) === expected));
}
//#endregion
//#region ../runner/src/score.ts
/** Shared normalization for inline and final predicate and judge rules. */
function normalizeScore(value) {
	const normalized = typeof value === "boolean" ? { value: Number(value) } : typeof value === "number" ? { value } : value;
	if (!normalized || !Number.isFinite(normalized.value) || normalized.value < 0 || normalized.value > 1) throw new Error(`Score value must be a finite number from 0 to 1; received ${normalized?.value}`);
	if ("judge" in normalized && normalized.judge) {
		const { usage } = normalized.judge;
		if (usage && Object.values(usage).some((tokens) => !Number.isSafeInteger(tokens) || tokens < 0)) throw new Error("Judge token usage must contain nonnegative integers");
	}
	return {
		value: normalized.value,
		passed: normalized.passed ?? normalized.value === 1,
		...normalized.explanation ? { explanation: normalized.explanation } : {},
		...normalized.evidence === void 0 ? {} : { evidence: normalized.evidence },
		..."judge" in normalized && normalized.judge !== void 0 ? { judge: normalized.judge } : {}
	};
}
//#endregion
//#region ../runner/src/judge-agent.ts
const failure$2 = (name, cause) => new RuleExecutionError({
	name,
	cause,
	message: cause instanceof Error ? cause.message : String(cause)
});
/** Drive a distinct agent session for one assessment; do not add its events to AUT trajectory. */
function runJudgeAgent(rule, agent, input, placement) {
	const events = [];
	const context = {
		...input.context,
		workspace: input.artifacts.evaluator,
		evaluatorWorkspace: input.artifacts.evaluator
	};
	const prompt = JSON.stringify({
		name: rule.name,
		rubric: rule.rubric,
		placement,
		evidence: placement === "transcript" ? { turn: input.turn?.events ?? [] } : { trajectory: input.trajectory.events },
		instruction: "Return only a JSON verdict with value (a number from 0 to 1), optional passed, explanation, and evidence."
	});
	let closeError;
	return Effect.gen(function* () {
		yield* Effect.acquireUseRelease(Effect.tryPromise({
			try: () => agent.start({
				context,
				onEvent: (event) => {
					const observed = Schema.decodeUnknownSync(TrajectoryEventSchema)({
						...event,
						source: "aut"
					});
					if (observed.source !== "aut") throw new Error("Invalid judge event source");
					const { source: _, ...validated } = observed;
					events.push(validated);
				}
			}),
			catch: (cause) => failure$2(rule.name, cause)
		}), (session) => Effect.tryPromise({
			try: () => session.send(prompt),
			catch: (cause) => failure$2(rule.name, cause)
		}), (session) => Effect.tryPromise({
			try: () => session.close(),
			catch: (cause) => failure$2(rule.name, cause)
		}).pipe(Effect.catchAll((error) => Effect.sync(() => {
			closeError = error;
		}))));
		if (closeError) return yield* Effect.fail(closeError);
		const completed = events.slice().reverse().find((event) => event.kind === "completed" && event.output !== void 0);
		const assistant = events.slice().reverse().find((event) => event.kind === "message" && event.role === "assistant");
		const output = completed?.kind === "completed" ? completed.output : assistant?.kind === "message" ? assistant.content : void 0;
		if (output === void 0) return yield* Effect.fail(failure$2(rule.name, /* @__PURE__ */ new Error("Judge agent did not emit a verdict")));
		const value = yield* Effect.try({
			try: () => typeof output === "string" ? JSON.parse(output) : output,
			catch: (cause) => failure$2(rule.name, cause)
		});
		const encodedEvents = yield* Schema.decodeUnknown(JsonValueSchema)(events).pipe(Effect.mapError((cause) => failure$2(rule.name, cause)));
		if (!Array.isArray(encodedEvents)) return yield* Effect.fail(failure$2(rule.name, /* @__PURE__ */ new Error("Judge events must be an array")));
		const usage = events.slice().reverse().find((event) => event.kind === "turn-completed" && event.usage);
		return {
			value,
			judge: {
				...agent.identity ? { agent: agent.identity } : {},
				...usage?.kind === "turn-completed" && usage.usage ? { usage: usage.usage } : {},
				events: encodedEvents
			}
		};
	});
}
//#endregion
//#region ../runner/src/evaluate-rule.ts
const failure$1 = (name, cause) => new RuleExecutionError({
	name,
	cause,
	message: cause instanceof Error ? cause.message : String(cause)
});
/** Both placements call the same rule executor; only input timing and persistence differ. */
function evaluateRule(rule, input, judgeAgent, placement) {
	return Effect.gen(function* () {
		if (rule.kind === "judge" && !judgeAgent) return yield* Effect.fail(failure$1(rule.name, /* @__PURE__ */ new Error("Judge rules require an eval judge agent")));
		const evaluated = rule.kind === "predicate" ? { value: yield* Effect.tryPromise({
			try: async () => rule.run(input),
			catch: (cause) => failure$1(rule.name, cause)
		}) } : yield* runJudgeAgent(rule, judgeAgent, input, placement);
		const score = yield* Effect.try({
			try: () => normalizeScore(evaluated.value),
			catch: (cause) => failure$1(rule.name, cause)
		});
		const withJudge = rule.kind === "judge" && "judge" in evaluated ? {
			...score,
			judge: evaluated.judge
		} : score;
		const validated = yield* Schema.decodeUnknown(ScoreResultSchema)({
			name: rule.name,
			kind: rule.kind,
			durationMs: 0,
			...withJudge
		}).pipe(Effect.mapError((cause) => failure$1(rule.name, cause)));
		return {
			value: validated.value,
			passed: validated.passed,
			...validated.explanation === void 0 ? {} : { explanation: validated.explanation },
			...validated.evidence === void 0 ? {} : { evidence: validated.evidence },
			...validated.judge === void 0 ? {} : { judge: validated.judge }
		};
	});
}
//#endregion
//#region ../runner/src/checkpoint.ts
const failure = (step, name, cause) => new CheckpointExecutionError({
	step,
	name,
	cause,
	message: cause instanceof Error ? cause.message : String(cause)
});
/** An assertion failure is a successful Effect containing a failed result; only execution errors enter the error channel. */
function evaluateCheckpoint(step, index, input, now, judgeAgent) {
	const annotations = {
		evalId: input.context.evalId,
		runId: input.context.runId,
		trialId: input.context.trialId,
		step: index,
		checkpoint: step.name
	};
	return Effect.gen(function* () {
		const started = now();
		yield* Effect.logDebug("checkpoint started");
		const match = step.kind === "expect-tool-call" ? yield* Effect.try({
			try: () => matchingToolCall(input.turn, step.expected.name, step.expected.arguments),
			catch: (cause) => failure(index, step.name, cause)
		}) : void 0;
		const score = step.kind === "expect-tool-call" ? yield* Effect.try({
			try: () => normalizeScore(Boolean(match)),
			catch: (cause) => failure(index, step.name, cause)
		}) : yield* evaluateRule(step, input, judgeAgent, "transcript").pipe(Effect.mapError((cause) => failure(index, step.name, cause)));
		const result = yield* Schema.decodeUnknown(CheckpointResultSchema)({
			step: index,
			kind: step.kind,
			name: step.name,
			status: score.passed ? "passed" : "failed",
			durationMs: now().getTime() - started.getTime(),
			...score,
			...match ? { matchedToolCall: {
				eventIndex: match.eventIndex,
				id: match.id
			} } : {}
		}).pipe(Effect.mapError((cause) => failure(index, step.name, cause)));
		yield* Effect.logInfo("checkpoint completed").pipe(Effect.annotateLogs({ status: result.status }));
		return {
			...result,
			status: score.passed ? "passed" : "failed"
		};
	}).pipe(Effect.tapError((error) => Effect.logError("checkpoint execution error").pipe(Effect.annotateLogs({ errorName: error._tag }))), Effect.annotateLogs(annotations));
}
//#endregion
//#region ../runner/src/effect-boundary.ts
/** Keep tagged Effect failures intact when bridging into the legacy async reporting lifecycle. Defects still reject. */
async function runBoundary(effect) {
	const outcome = await Effect.runPromise(Effect.either(effect));
	if (Either.isLeft(outcome)) throw outcome.left;
	return outcome.right;
}
//#endregion
//#region ../runner/src/local-report-store.ts
const MANIFEST_FILE = "manifest.json";
async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
async function replaceJson(filePath, value) {
	const temporary = `${filePath}.${randomUUID()}.tmp`;
	await writeJson(temporary, value);
	await rename(temporary, filePath);
}
function assertPathSegment(value, name) {
	if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) throw new Error(`${name} must be a single relative path segment`);
}
function artifactPath(root, value) {
	if (!value || path.isAbsolute(value)) throw new Error(`Artifact path must be a non-empty relative path: ${value}`);
	const normalized = path.normalize(value);
	if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error(`Artifact path escapes its root: ${value}`);
	return path.join(root, normalized);
}
var LocalTrialWriter = class {
	directory;
	metadata;
	constructor(directory, metadata) {
		this.directory = directory;
		this.metadata = metadata;
	}
	appendEvent(event) {
		return appendFile(path.join(this.directory, "trajectory.jsonl"), `${JSON.stringify(Schema.encodeSync(TrajectoryEventSchema)(event))}\n`);
	}
	writeScores(scoring) {
		return writeJson(path.join(this.directory, "scoring.json"), Schema.encodeSync(TrialScoringSchema)(scoring));
	}
	async writeArtifact(relativePath, data) {
		const target = artifactPath(path.join(this.directory, "artifacts"), relativePath);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, data);
	}
	async finalize(summary) {
		await writeJson(path.join(this.directory, "summary.json"), Schema.encodeSync(TrialSummarySchema)(summary));
		await replaceJson(path.join(this.directory, MANIFEST_FILE), {
			...Schema.encodeSync(TrialMetadataSchema)(this.metadata),
			status: summary.status
		});
	}
};
var LocalRunWriter = class {
	location;
	directory;
	metadata;
	constructor(location, directory, metadata) {
		this.location = location;
		this.directory = directory;
		this.metadata = metadata;
	}
	async startTrial(metadata) {
		assertPathSegment(metadata.trialId, "trialId");
		const directory = path.join(this.directory, "trials", metadata.trialId);
		await mkdir(directory, { recursive: true });
		await writeJson(path.join(directory, MANIFEST_FILE), {
			...Schema.encodeSync(TrialMetadataSchema)(metadata),
			status: "running"
		});
		return new LocalTrialWriter(directory, metadata);
	}
	async finalize(summary) {
		await writeJson(path.join(this.directory, "summary.json"), Schema.encodeSync(RunSummarySchema)(summary));
		await replaceJson(path.join(this.directory, MANIFEST_FILE), {
			...Schema.encodeSync(RunMetadataSchema)(this.metadata),
			status: summary.status
		});
	}
};
/** Persists each run as a local tree rooted below `rootDirectory`. */
function localReportStore(rootDirectory) {
	return { async startRun(metadata) {
		assertPathSegment(metadata.runId, "runId");
		const directory = path.resolve(rootDirectory, metadata.runId);
		await mkdir(directory, { recursive: true });
		await writeJson(path.join(directory, MANIFEST_FILE), {
			...Schema.encodeSync(RunMetadataSchema)(metadata),
			status: "running"
		});
		return new LocalRunWriter(path.relative(process.cwd(), directory), directory, metadata);
	} };
}
//#endregion
//#region ../runner/src/local-report-reader.ts
/** Shared v2/v3 local report boundary for CLI, dashboard, and CI consumers. */
async function decode(file, schema) {
	return Schema.decodeUnknownSync(schema)(JSON.parse(await readFile(file, "utf8")));
}
const readRunManifest = (root, runId) => decode(join(root, runId, "manifest.json"), RunManifestSchema);
const readRunSummary = (root, runId) => decode(join(root, runId, "summary.json"), RunSummarySchema);
const readTrialManifest = (root, runId, trialId) => decode(join(root, runId, "trials", trialId, "manifest.json"), TrialManifestSchema);
const readTrialSummary = (root, runId, trialId) => decode(join(root, runId, "trials", trialId, "summary.json"), TrialSummarySchema);
const readTrialScoring = (root, runId, trialId) => decode(join(root, runId, "trials", trialId, "scoring.json"), TrialScoringSchema);
async function readTrialEvents(root, runId, trialId) {
	return parseTrajectoryJsonl(await readFile(join(root, runId, "trials", trialId, "trajectory.jsonl"), "utf8"));
}
//#endregion
//#region ../runner/src/matrix.ts
/** Bounded workers pull cells from the iterator; no Cartesian job array is allocated. */
function runMatrix(matrix, options) {
	return Effect.gen(function* () {
		const concurrency = options.concurrency ?? 4;
		if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer");
		const count = matrix.count(options.selection);
		const iterator = matrix.cells(options.selection);
		const summary = {
			cells: 0,
			passed: 0,
			failed: 0
		};
		yield* Effect.all(Array.from({ length: Math.min(count, concurrency) }, () => Effect.gen(function* () {
			while (true) {
				const next = iterator.next();
				if (next.done) return;
				const cell = next.value;
				const runtime = options.runtime ?? [
					"local",
					"remote",
					"sandbox"
				].find((name) => cell.eval.agent.runtimes?.[name]);
				const result = yield* runEval(cell.eval, {
					...options,
					concurrency: 1,
					runtime,
					parameters: cell.parameters,
					matrix: {
						id: matrix.id,
						cellKey: cell.key
					}
				});
				summary.cells++;
				if (result.status === "completed" && (result.aggregateScoring?.passRate === 1 || result.scoring?.passed)) summary.passed++;
				else summary.failed++;
				if (options.onResult) yield* Effect.tryPromise(async () => options.onResult(cell, result));
			}
		})), { concurrency });
		return summary;
	});
}
//#endregion
//#region ../runner/src/index.ts
/** Effect-native aggregate eval execution entry point. */
function runEval(definition, options) {
	return Effect.gen(function* () {
		yield* Effect.logInfo("eval run started").pipe(Effect.annotateLogs({
			evalId: authoringId(definition),
			...options.runId ? { runId: options.runId } : {},
			...options.suiteId ? { suiteId: options.suiteId } : {}
		}));
		const result = yield* Effect.tryPromise({
			try: () => executeRun(definition, options),
			catch: (error) => error
		});
		yield* Effect.logInfo("eval run finished").pipe(Effect.annotateLogs({
			evalId: authoringId(definition),
			runId: result.runId,
			status: result.status
		}));
		return result;
	});
}
function createId(_kind) {
	return crypto.randomUUID();
}
function canonicalId(kind, id) {
	return resourceUri(kind, id);
}
function assertUuid(value, label) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${label} must be a UUID`);
}
function scoreSummary(results, checkpoints, skippedScorers) {
	const valid = results.filter((result) => result.value !== void 0);
	const hasError = results.some((result) => result.error !== void 0);
	return {
		results,
		...checkpoints.length ? { checkpoints } : {},
		...skippedScorers.length ? { skippedScorers } : {},
		...valid.length === 0 ? {} : { overall: valid.reduce((sum, result) => sum + (result.value ?? 0), 0) / valid.length },
		passed: !hasError && results.every((result) => result.passed === true) && checkpoints.every((result) => result.status === "passed") && !skippedScorers.length
	};
}
/** Executes one aggregate eval run and its requested isolated trials. */
async function executeRun(definition, options) {
	let hasUser = false;
	for (const step of definition.transcript) if (step.kind === "user") hasUser = true;
	else if (step.kind !== "agent" && !hasUser) throw new Error("Checkpoint requires a preceding user step");
	if (definition.judge && definition.judge === definition.agent) throw new Error("Judge agent must be distinct from the agent under test");
	if (options.runId) assertUuid(options.runId, "runId");
	if (options.trialId) assertUuid(options.trialId, "trialId");
	const requestedTrials = options.trials ?? definition.policy?.trials ?? 1;
	if (!Number.isInteger(requestedTrials) || requestedTrials < 1) throw new Error(`Trial count must be a positive integer; received ${requestedTrials}`);
	if (requestedTrials === 1) return runTrial(definition, options);
	const now = options.now ?? (() => /* @__PURE__ */ new Date());
	const aggregateStartedAt = now();
	const runId = options.runId ?? createId("run");
	const runWriter = await options.report.startRun({
		schemaVersion: 3,
		runId,
		runUri: canonicalId("run", runId),
		evalId: definition.id,
		...options.suiteId ? { suiteId: options.suiteId } : {},
		...definition.agent.identity ? { aut: definition.agent.identity } : {},
		parameters: options.parameters,
		matrix: options.matrix,
		startedAt: aggregateStartedAt.toISOString()
	});
	const trialEffects = Array.from({ length: requestedTrials }, (_, trialIndex) => {
		const trial = Effect.tryPromise({
			try: () => runTrial(definition, {
				...options,
				runId,
				trialId: createId("trial"),
				trials: 1,
				runWriter,
				trialIndex
			}),
			catch: (error) => error
		});
		return options.semaphore ? options.semaphore.withPermits(1)(trial) : trial;
	});
	const trials = await Effect.runPromise(Effect.all(trialEffects, { concurrency: options.concurrency ?? 32 }));
	const failed = trials.filter((trial) => trial.status !== "completed" || !trial.scoring?.passed).length;
	const status = trials.some((trial) => trial.status === "failed") ? "failed" : "completed";
	const endedAt = now();
	await runWriter.finalize({
		status,
		endedAt: endedAt.toISOString(),
		durationMs: endedAt.getTime() - aggregateStartedAt.getTime(),
		trialCount: trials.length,
		passed: trials.length - failed,
		failed
	});
	const overallScores = trials.map((trial) => trial.scoring?.overall).filter((score) => score !== void 0);
	return {
		...trials[0],
		runId,
		evalId: authoringId(definition),
		status,
		trialCount: trials.length,
		passed: trials.length - failed,
		failed,
		aggregateScoring: {
			passed: trials.length - failed,
			failed,
			passRate: (trials.length - failed) / trials.length,
			...overallScores.length ? { overall: overallScores.reduce((sum, score) => sum + score, 0) / overallScores.length } : {}
		},
		trials
	};
}
async function runTrial(definition, options) {
	const now = options.now ?? (() => /* @__PURE__ */ new Date());
	const runId = options.runId ?? createId("run");
	const trialId = options.trialId ?? createId("trial");
	const startedAt = now().toISOString();
	const selectedRuntime = options.runtime;
	const runtime = selectedRuntime ? definition.agent.runtimes?.[selectedRuntime] : void 0;
	if (selectedRuntime && !runtime) throw new Error(`AUT does not declare the requested ${selectedRuntime} runtime`);
	const randomSeed = crypto.getRandomValues(/* @__PURE__ */ new Uint32Array(1))[0];
	const fixtureContext = {
		runId,
		evalId: authoringId(definition),
		trialId,
		trialIndex: options.trialIndex ?? 0,
		metadata: {
			...definition.metadata ?? {},
			randomSeed
		},
		...options.parameters ? { parameters: options.parameters } : {},
		...selectedRuntime ? { runtime: selectedRuntime } : {}
	};
	const events = [];
	const runWriter = options.runWriter ?? await options.report.startRun({
		schemaVersion: 3,
		runId,
		runUri: canonicalId("run", runId),
		evalId: definition.id,
		...options.suiteId ? { suiteId: options.suiteId } : {},
		...definition.agent.identity ? { aut: definition.agent.identity } : {},
		parameters: options.parameters,
		matrix: options.matrix,
		startedAt
	});
	const trialWriter = await runWriter.startTrial({
		schemaVersion: 3,
		runId,
		runUri: canonicalId("run", runId),
		trialId,
		trialUri: canonicalId("trial", trialId),
		trialIndex: options.trialIndex ?? 0,
		evalId: definition.id,
		...definition.agent.identity ? { aut: definition.agent.identity } : {},
		parameters: options.parameters,
		matrix: options.matrix,
		startedAt
	});
	let writeChain = Promise.resolve();
	let reportingFailed = false;
	const append = async (event) => {
		events.push(event);
		writeChain = writeChain.then(() => trialWriter.appendEvent(event));
		try {
			await writeChain;
		} catch (cause) {
			reportingFailed = true;
			throw new ReportError({
				cause,
				message: cause instanceof Error ? cause.message : String(cause)
			});
		}
	};
	const emitRunner = (event) => append({
		...event,
		source: "runner"
	});
	const onAutEvent = (event) => append({
		...event,
		source: "aut"
	});
	let workspace;
	let context;
	let primaryError;
	let closeError;
	let scoring;
	let artifacts;
	let status = "running";
	const checkpoints = [];
	let stoppedEarly = false;
	let lastTurn;
	let cleanupError;
	const workspaceScope = await Effect.runPromise(Scope.make());
	try {
		await emitRunner({
			kind: "trial-started",
			timestamp: now().toISOString()
		});
		workspace = await runBoundary(Effect.acquireRelease(Effect.tryPromise({
			try: () => createTrialWorkspace(fixtureContext, definition.fixtures, options.workspaceRoot),
			catch: (cause) => new FixtureError({
				cause,
				message: cause instanceof Error ? cause.message : String(cause)
			})
		}), (created) => Effect.tryPromise({
			try: () => created.cleanup(),
			catch: (cause) => new FixtureError({
				cause,
				message: cause instanceof Error ? cause.message : String(cause)
			})
		}).pipe(Effect.catchAll((error) => Effect.sync(() => {
			cleanupError = error;
		}).pipe(Effect.tap(() => Effect.logError("trial workspace cleanup failed")))))).pipe(Effect.provideService(Scope.Scope, workspaceScope)));
		const trialWorkspace = workspace;
		const trialContext = {
			...fixtureContext,
			workspace: trialWorkspace.artifacts.candidate,
			evaluatorWorkspace: trialWorkspace.artifacts.evaluator
		};
		context = trialContext;
		await runBoundary(Effect.acquireUseRelease(Effect.tryPromise({
			try: () => definition.agent.start({
				context: trialContext,
				...runtime ? { runtime } : {},
				onEvent: onAutEvent
			}),
			catch: (cause) => new AutExecutionError({
				cause,
				message: cause instanceof Error ? cause.message : String(cause)
			})
		}), (session) => Effect.tryPromise({
			try: async () => {
				for (const [index, step] of definition.transcript.entries()) {
					await emitRunner({
						kind: "transcript-step-started",
						step: index,
						timestamp: now().toISOString()
					});
					if (step.kind === "user") {
						const cursor = events.length;
						await runBoundary(Effect.tryPromise({
							try: () => session.send(step.message.replaceAll("{{randomSeed}}", String(randomSeed))),
							catch: (cause) => cause instanceof ReportError ? cause : new AutExecutionError({
								cause,
								message: cause instanceof Error ? cause.message : String(cause)
							})
						}));
						lastTurn = turnView(events, cursor, events.length, index);
					} else if (step.kind === "predicate" || step.kind === "judge" || step.kind === "expect-tool-call") {
						if (!lastTurn) throw new Error("Checkpoint requires a preceding user step");
						const started = now();
						await emitRunner({
							kind: "checkpoint-started",
							step: index,
							name: step.name,
							timestamp: started.toISOString()
						});
						const result = await runBoundary(evaluateCheckpoint(step, index, {
							context: trialContext,
							artifacts: trialWorkspace.artifacts,
							trajectory: { events },
							turn: lastTurn
						}, now, definition.judge)).catch(async (error) => {
							const recorded = recordError(error);
							checkpoints.push({
								step: index,
								kind: step.kind,
								name: step.name,
								status: "error",
								durationMs: now().getTime() - started.getTime(),
								error: recorded
							});
							try {
								await emitRunner({
									kind: "checkpoint-error",
									step: index,
									error: recorded,
									timestamp: now().toISOString()
								});
							} catch {}
							throw error;
						});
						checkpoints.push(result);
						await emitRunner({
							kind: "checkpoint-completed",
							step: index,
							status: result.status,
							timestamp: now().toISOString()
						});
						await emitRunner({
							kind: "transcript-step-completed",
							step: index,
							timestamp: now().toISOString()
						});
						if (!result.passed && definition.policy?.failfast) {
							stoppedEarly = true;
							for (let skipped = index + 1; skipped < definition.transcript.length; skipped++) {
								await emitRunner({
									kind: "transcript-step-skipped",
									step: skipped,
									timestamp: now().toISOString()
								});
								const remaining = definition.transcript[skipped];
								if (remaining.kind === "predicate" || remaining.kind === "judge" || remaining.kind === "expect-tool-call") checkpoints.push({
									step: skipped,
									kind: remaining.kind,
									name: remaining.name,
									status: "skipped"
								});
							}
							break;
						}
						continue;
					} else throw new Error(`Transcript step kind "${step.kind}" is not executable yet`);
					await emitRunner({
						kind: "transcript-step-completed",
						step: index,
						timestamp: now().toISOString()
					});
				}
			},
			catch: (cause) => cause
		}), (opened) => Effect.tryPromise({
			try: () => opened.close(),
			catch: (cause) => new AutExecutionError({
				cause,
				message: cause instanceof Error ? cause.message : String(cause)
			})
		}).pipe(Effect.catchAll((error) => Effect.sync(() => {
			closeError = error;
		}).pipe(Effect.tap(() => Effect.logError("AUT session close failed")))))).pipe(Effect.annotateLogs({
			runId,
			trialId,
			evalId: definition.id
		})));
	} catch (error) {
		primaryError = error;
		try {
			await emitRunner({
				kind: "error",
				error: recordError(error),
				timestamp: now().toISOString()
			});
		} catch {}
	}
	if (closeError) {
		if (!primaryError) primaryError = closeError;
		try {
			await emitRunner({
				kind: "error",
				error: recordError(closeError),
				timestamp: now().toISOString()
			});
		} catch {}
	}
	const scoreResults = [];
	const skippedScorers = [];
	try {
		for (const scorer of definition.scoring) {
			if (reportingFailed || !context || !workspace || (primaryError || stoppedEarly) && (!("supportsPartial" in scorer) || !scorer.supportsPartial)) {
				skippedScorers.push(scorer.name);
				continue;
			}
			const started = now();
			await emitRunner({
				kind: "scorer-started",
				scorer: scorer.name,
				timestamp: started.toISOString()
			});
			let result;
			try {
				const score = await runBoundary(evaluateRule(scorer, {
					context,
					artifacts: workspace.artifacts,
					trajectory: { events },
					...lastTurn ? { turn: lastTurn } : {}
				}, definition.judge, "scoring").pipe(Effect.mapError((cause) => new ScoringError({
					cause,
					message: cause.message
				}))));
				result = {
					name: scorer.name,
					kind: scorer.kind,
					durationMs: now().getTime() - started.getTime(),
					...score
				};
				scoreResults.push(result);
			} catch (error) {
				const recorded = recordError(error);
				scoreResults.push({
					name: scorer.name,
					kind: scorer.kind,
					durationMs: now().getTime() - started.getTime(),
					error: recorded,
					passed: false
				});
				await emitRunner({
					kind: "scorer-failed",
					scorer: scorer.name,
					error: recorded,
					timestamp: now().toISOString()
				});
				continue;
			}
			await emitRunner({
				kind: "scorer-completed",
				scorer: scorer.name,
				value: result.value ?? 0,
				timestamp: now().toISOString()
			});
		}
		scoring = scoreSummary(scoreResults, checkpoints, skippedScorers);
		await trialWriter.writeScores(scoring);
		if (workspace) try {
			artifacts = await snapshotCandidateWorkspace(workspace.artifacts.candidate.root, trialWriter);
		} catch (captureError) {
			if (!primaryError) primaryError = captureError;
			try {
				await emitRunner({
					kind: "error",
					error: recordError(captureError),
					timestamp: now().toISOString()
				});
			} catch {}
		}
	} catch (error) {
		if (!primaryError) primaryError = error;
		try {
			await emitRunner({
				kind: "error",
				error: recordError(error),
				timestamp: now().toISOString()
			});
		} catch {}
	} finally {
		await Effect.runPromise(Scope.close(workspaceScope, Exit.succeed(void 0)));
		if (cleanupError) {
			if (!primaryError) primaryError = cleanupError;
			try {
				await emitRunner({
					kind: "error",
					error: recordError(cleanupError),
					timestamp: now().toISOString()
				});
			} catch {}
		}
	}
	scoring ??= scoreSummary(scoreResults, checkpoints, skippedScorers);
	if (!primaryError) try {
		await emitRunner({
			kind: "trial-completed",
			timestamp: now().toISOString()
		});
	} catch (error) {
		primaryError = error;
	}
	status = primaryError ? "failed" : "completed";
	const error = primaryError ? recordError(primaryError) : void 0;
	const endedAt = now().toISOString();
	await trialWriter.finalize({
		status,
		endedAt,
		durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
		scoring,
		...artifacts ? { artifacts } : {},
		...error ? { error } : {}
	});
	if (!options.runWriter) await runWriter.finalize({
		status,
		endedAt,
		trialCount: 1,
		passed: status === "completed" && scoring.passed ? 1 : 0,
		failed: status === "failed" || !scoring.passed ? 1 : 0,
		...error ? { error } : {}
	});
	return {
		runId,
		runUri: canonicalId("run", runId),
		trialId,
		trialUri: canonicalId("trial", trialId),
		trialIndex: options.trialIndex ?? 0,
		evalId: definition.id,
		status,
		reportLocation: runWriter.location,
		durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
		scoring,
		...error ? { error } : {}
	};
}
//#endregion
export { readTrialEvents as a, readTrialSummary as c, CheckpointExecutionError as d, FixtureError as f, readRunSummary as i, localReportStore as l, ScoringError as m, runMatrix as n, readTrialManifest as o, ReportError as p, readRunManifest as r, readTrialScoring as s, runEval as t, AutExecutionError as u };

//# sourceMappingURL=src-DFYKSBol.mjs.map