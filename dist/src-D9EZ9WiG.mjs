import * as Schema from "effect/Schema";
//#region ../core/src/identity.ts
const ResourceKindSchema = Schema.Literal("run", "trial", "artifact");
/** Human-authored project-local identifier; never a generated resource URI. */
function authorId(value) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`ID must be lowercase kebab-case: ${value}`);
	return value;
}
/** RFC 4122 textual UUID. EvalKit accepts v4/v7 and other valid UUID versions. */
const UuidSchema = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
const ResourceUriSchema = Schema.String.pipe(Schema.pattern(/^evalkit:(run|trial|artifact):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
function resourceUriSchema(kind) {
	return Schema.String.pipe(Schema.pattern(new RegExp(`^evalkit:${kind}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i")));
}
function resourceUri(kind, uuid) {
	return `evalkit:${kind}:${uuid}`;
}
function parseResourceUri(value, expectedKind) {
	const match = /^evalkit:(run|trial|artifact):(.+)$/.exec(value);
	if (!match) throw new Error(`Invalid EvalKit resource URI: ${value}`);
	const kind = match[1];
	if (expectedKind && kind !== expectedKind) throw new Error(`Expected an EvalKit ${expectedKind} URI; received ${value}`);
	const uuid = Schema.decodeUnknownSync(UuidSchema)(match[2]);
	return {
		kind,
		uuid,
		uri: resourceUri(kind, uuid)
	};
}
function resourceUuid(value, expectedKind) {
	return parseResourceUri(value, expectedKind).uuid;
}
//#endregion
//#region ../core/src/matrix.ts
/** Canonical JSON: keys sorted recursively, array order preserved. Rejects non-JSON inputs. */
function canonicalParameters(value) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalParameters).join(",")}]`;
	if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalParameters(value[key])}`).join(",")}}`;
	throw new Error("Matrix parameters must be finite JSON values");
}
function defineEvalMatrix(definition) {
	authoringId(definition);
	const identities = /* @__PURE__ */ new Set();
	for (const evaluation of definition.evals) {
		const id = authoringId(evaluation);
		if (identities.has(id)) throw new Error(`Duplicate matrix eval: ${id}`);
		identities.add(id);
	}
	const axes = Object.entries(definition.parameters).sort(([a], [b]) => a.localeCompare(b));
	for (const [axis, choices] of axes) {
		if (!axis || !choices.length) throw new Error(`Matrix axis ${axis} must have at least one value`);
		const keys = choices.map(canonicalParameters);
		if (new Set(keys).size !== keys.length) throw new Error(`Duplicate values for matrix axis: ${axis}`);
	}
	canonicalParameters(definition.defaults ?? {});
	function select(selection = {}) {
		for (const key of Object.keys(selection.parameters ?? {})) if (!(key in definition.parameters)) throw new Error(`Unknown matrix axis: ${key}`);
		for (const key of Object.keys(selection.overrides ?? {})) if (key in definition.parameters) throw new Error(`Select axis ${key}; do not override it`);
		canonicalParameters(selection.overrides ?? {});
		for (const name of selection.evals ?? []) if (!definition.evals.some((e) => e.id === name)) throw new Error(`Unknown matrix eval: ${name}`);
		return {
			evals: definition.evals.filter((e) => !selection.evals || selection.evals.includes(e.id)),
			axes: axes.map(([axis, choices]) => {
				const selected = selection.parameters?.[axis];
				if (!selected) return [axis, choices];
				const keys = new Set(selected.map(canonicalParameters));
				for (const key of keys) if (!choices.some((v) => canonicalParameters(v) === key)) throw new Error(`Unknown ${axis} value: ${key}`);
				return [axis, choices.filter((v) => keys.has(canonicalParameters(v)))];
			}),
			defaults: {
				...definition.defaults,
				...selection.overrides
			}
		};
	}
	return {
		...definition,
		kind: "matrix",
		count(selection) {
			const selected = select(selection);
			const count = selected.axes.reduce((n, [, choices]) => n * choices.length, selected.evals.length);
			if (!Number.isSafeInteger(count)) throw new Error("Matrix exceeds safe cell count");
			return count;
		},
		*cells(selection) {
			const selected = select(selection);
			function* expand(index, values) {
				if (index === selected.axes.length) {
					yield values;
					return;
				}
				const [axis, choices] = selected.axes[index];
				for (const choice of choices) yield* expand(index + 1, {
					...values,
					[axis]: choice
				});
			}
			for (const evaluation of selected.evals) for (const parameters of expand(0, selected.defaults)) yield {
				matrixId: definition.id,
				eval: evaluation,
				parameters,
				key: canonicalParameters({
					matrix: authoringId(definition),
					eval: authoringId(evaluation),
					parameters
				})
			};
		}
	};
}
//#endregion
//#region ../core/src/schema.ts
/** Runtime schemas for serialized EvalKit report and API boundaries. */
const RunStatusSchema = Schema.Literal("running", "completed", "failed", "cancelled");
const RecordedErrorSchema = Schema.Struct({
	name: Schema.String,
	message: Schema.String,
	stack: Schema.optional(Schema.String)
});
const AutIdentitySchema = Schema.Struct({
	name: Schema.optional(Schema.String),
	kind: Schema.String,
	id: Schema.String,
	version: Schema.optional(Schema.String)
});
const JsonValueSchema = Schema.suspend(() => Schema.Union(Schema.Null, Schema.Boolean, Schema.Number, Schema.String, Schema.mutable(Schema.Array(JsonValueSchema)), Schema.Record({
	key: Schema.String,
	value: JsonValueSchema
})));
const ParametersSchema = Schema.Record({
	key: Schema.String,
	value: JsonValueSchema
});
const MatrixCellSchema = Schema.Struct({
	id: Schema.String,
	cellKey: Schema.String
});
const RunMetadataSchema = Schema.Struct({
	schemaVersion: Schema.Literal(2, 3),
	runUri: resourceUriSchema("run"),
	evalId: Schema.String,
	suiteId: Schema.optional(Schema.String),
	parameters: Schema.optional(ParametersSchema),
	matrix: Schema.optional(MatrixCellSchema),
	aut: Schema.optional(AutIdentitySchema),
	startedAt: Schema.String
});
const TrialMetadataSchema = Schema.Struct({
	schemaVersion: Schema.Literal(2, 3),
	runUri: resourceUriSchema("run"),
	trialUri: resourceUriSchema("trial"),
	trialIndex: Schema.Number,
	evalId: Schema.String,
	parameters: Schema.optional(ParametersSchema),
	matrix: Schema.optional(MatrixCellSchema),
	aut: Schema.optional(AutIdentitySchema),
	startedAt: Schema.String
});
/** On-disk manifests include a lifecycle status; older finalized manifests may still say running. */
const RunManifestSchema = Schema.Struct({
	...RunMetadataSchema.fields,
	status: Schema.optional(RunStatusSchema)
});
const TrialManifestSchema = Schema.Struct({
	...TrialMetadataSchema.fields,
	status: Schema.optional(RunStatusSchema)
});
const UsageSchema = Schema.Struct({
	inputTokens: Schema.optional(Schema.Number),
	outputTokens: Schema.optional(Schema.Number),
	totalTokens: Schema.optional(Schema.Number)
});
const JudgeRunInfoSchema = Schema.Struct({
	agent: Schema.optional(Schema.Struct({
		id: Schema.String,
		kind: Schema.String,
		name: Schema.optional(Schema.String),
		version: Schema.optional(Schema.String)
	})),
	usage: Schema.optional(UsageSchema),
	events: Schema.optional(Schema.mutable(Schema.Array(JsonValueSchema)))
});
const ScoreResultSchema = Schema.Struct({
	name: Schema.String,
	kind: Schema.Literal("predicate", "judge"),
	value: Schema.optional(Schema.Number),
	passed: Schema.optional(Schema.Boolean),
	explanation: Schema.optional(Schema.String),
	evidence: Schema.optional(JsonValueSchema),
	judge: Schema.optional(JudgeRunInfoSchema),
	durationMs: Schema.Number,
	error: Schema.optional(RecordedErrorSchema)
});
const CheckpointResultSchema = Schema.Struct({
	step: Schema.Number,
	kind: Schema.Literal("predicate", "judge", "expect-tool-call"),
	name: Schema.String,
	status: Schema.Literal("passed", "failed", "error", "skipped"),
	value: Schema.optional(Schema.Number),
	passed: Schema.optional(Schema.Boolean),
	explanation: Schema.optional(Schema.String),
	evidence: Schema.optional(JsonValueSchema),
	judge: Schema.optional(JudgeRunInfoSchema),
	durationMs: Schema.optional(Schema.Number),
	error: Schema.optional(RecordedErrorSchema),
	matchedToolCall: Schema.optional(Schema.Struct({
		eventIndex: Schema.Number,
		id: Schema.String
	}))
});
const TrialScoringSchema = Schema.Struct({
	results: Schema.mutable(Schema.Array(ScoreResultSchema)),
	checkpoints: Schema.optional(Schema.mutable(Schema.Array(CheckpointResultSchema))),
	skippedScorers: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
	overall: Schema.optional(Schema.Number),
	passed: Schema.Boolean
});
const ArtifactEntrySchema = Schema.Struct({
	path: Schema.String,
	kind: Schema.Literal("file", "directory"),
	size: Schema.optional(Schema.Number)
});
const TrialSummarySchema = Schema.Struct({
	status: RunStatusSchema,
	endedAt: Schema.String,
	durationMs: Schema.optional(Schema.Number),
	scoring: Schema.optional(TrialScoringSchema),
	artifacts: Schema.optional(Schema.mutable(Schema.Array(ArtifactEntrySchema))),
	error: Schema.optional(RecordedErrorSchema)
});
const RunSummarySchema = Schema.Struct({
	status: RunStatusSchema,
	endedAt: Schema.String,
	durationMs: Schema.optional(Schema.Number),
	trialCount: Schema.Number,
	passed: Schema.Number,
	failed: Schema.Number,
	error: Schema.optional(RecordedErrorSchema)
});
const autEvent = {
	started: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("started"),
		timestamp: Schema.String
	}),
	message: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("message"),
		role: Schema.Literal("system", "user", "assistant", "tool"),
		content: JsonValueSchema,
		timestamp: Schema.String
	}),
	toolCall: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("tool-call"),
		id: Schema.String,
		name: Schema.String,
		arguments: JsonValueSchema,
		timestamp: Schema.String
	}),
	toolResult: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("tool-result"),
		id: Schema.String,
		name: Schema.optional(Schema.String),
		result: JsonValueSchema,
		timestamp: Schema.String
	}),
	turnStarted: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("turn-started"),
		turn: Schema.Number,
		timestamp: Schema.String
	}),
	turnCompleted: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("turn-completed"),
		turn: Schema.Number,
		timestamp: Schema.String,
		latencyMs: Schema.optional(Schema.Number),
		usage: Schema.optional(UsageSchema)
	}),
	completed: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("completed"),
		output: Schema.optional(JsonValueSchema),
		timestamp: Schema.String
	}),
	error: Schema.Struct({
		source: Schema.Literal("aut"),
		kind: Schema.Literal("error"),
		error: RecordedErrorSchema,
		timestamp: Schema.String
	})
};
const runnerEvent = {
	trialStarted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("trial-started"),
		timestamp: Schema.String
	}),
	stepStarted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("transcript-step-started"),
		step: Schema.Number,
		timestamp: Schema.String
	}),
	stepCompleted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("transcript-step-completed"),
		step: Schema.Number,
		timestamp: Schema.String
	}),
	stepSkipped: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("transcript-step-skipped"),
		step: Schema.Number,
		timestamp: Schema.String
	}),
	checkpointStarted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("checkpoint-started"),
		step: Schema.Number,
		name: Schema.String,
		timestamp: Schema.String
	}),
	checkpointCompleted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("checkpoint-completed"),
		step: Schema.Number,
		status: Schema.Literal("passed", "failed"),
		timestamp: Schema.String
	}),
	checkpointError: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("checkpoint-error"),
		step: Schema.Number,
		error: RecordedErrorSchema,
		timestamp: Schema.String
	}),
	scorerStarted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("scorer-started"),
		scorer: Schema.String,
		timestamp: Schema.String
	}),
	scorerCompleted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("scorer-completed"),
		scorer: Schema.String,
		value: Schema.Number,
		timestamp: Schema.String
	}),
	scorerFailed: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("scorer-failed"),
		scorer: Schema.String,
		error: RecordedErrorSchema,
		timestamp: Schema.String
	}),
	trialCompleted: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("trial-completed"),
		timestamp: Schema.String
	}),
	error: Schema.Struct({
		source: Schema.Literal("runner"),
		kind: Schema.Literal("error"),
		error: RecordedErrorSchema,
		timestamp: Schema.String
	})
};
const TrajectoryEventSchema = Schema.Union(...Object.values(autEvent), ...Object.values(runnerEvent));
const ApiErrorSchema = Schema.Struct({
	error: Schema.String,
	message: Schema.String
});
//#endregion
//#region ../core/src/trajectory.ts
/** Decode one private report's JSONL trajectory; reject malformed/non-event lines with their line number. */
function parseTrajectoryJsonl(contents) {
	const events = [];
	for (const [index, line] of contents.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		try {
			events.push(Schema.decodeUnknownSync(TrajectoryEventSchema)(JSON.parse(line)));
		} catch (cause) {
			throw new Error(`Invalid trajectory JSONL at line ${index + 1}`, { cause });
		}
	}
	return events;
}
//#endregion
//#region ../core/src/index.ts
/**
* Defines an Agent Under Test without coupling it to a runtime or transport.
* It preserves the adapter's concrete type for application-specific helpers.
*/
function defineAgent(agent) {
	if (agent.identity) authoringId(agent.identity);
	return agent;
}
function defaultFixtureDestination(src) {
	const normalized = src.replace(/\\/g, "/").replace(/\/+$/, "");
	const destination = normalized.slice(normalized.lastIndexOf("/") + 1);
	if (!destination || destination === "." || destination === "..") throw new Error(`Fixture source needs a basename: ${src}`);
	return destination;
}
/**
* Declares a directory relative to the invoking project's working directory.
* The short form is candidate-visible and copies beneath the source basename.
*/
function directory(src, options = {}) {
	return {
		kind: "directory",
		src,
		dst: options.dst ?? defaultFixtureDestination(src),
		visibility: options.visibility ?? "candidate"
	};
}
function file(src, options) {
	return {
		kind: "file",
		src,
		...options
	};
}
function inlineFile(file, data, visibility) {
	return {
		kind: "inline",
		file,
		data,
		visibility
	};
}
function dynamic(create) {
	return {
		kind: "dynamic",
		create
	};
}
/** Observes a tool call in the preceding turn; never invokes a tool. */
function expectToolCall(expected) {
	if (!expected.name.trim()) throw new Error("Expected tool name must not be empty");
	return {
		kind: "expect-tool-call",
		name: expected.name,
		expected
	};
}
function user(message) {
	return {
		kind: "user",
		message
	};
}
function agent(expectation) {
	return {
		kind: "agent",
		expectation
	};
}
function predicate(name, run, options = {}) {
	return {
		kind: "predicate",
		name,
		run,
		...options
	};
}
function judge(name, options) {
	if (!name.trim() || !options.rubric.trim()) throw new Error("Judge name and rubric must not be empty");
	return {
		kind: "judge",
		name,
		...options
	};
}
function defineEval(definition) {
	authoringId(definition);
	let hasUser = false;
	for (const step of definition.transcript) if (step.kind === "user") hasUser = true;
	else if (step.kind !== "agent" && !hasUser) throw new Error("Checkpoint requires a preceding user step");
	if ((definition.transcript.some((step) => step.kind === "judge") || definition.scoring.some((rule) => rule.kind === "judge")) && !definition.judge) throw new Error("Judge rules require an eval judge agent");
	if (definition.judge && definition.judge === definition.agent) throw new Error("Judge agent must be distinct from the agent under test");
	return definition;
}
function defineSuite(suite) {
	authoringId(suite);
	return suite;
}
function authoringId(value) {
	if ("uri" in value || "uuid" in value || "slug" in value) throw new Error("Authored resources use id, not uri, uuid, or slug");
	return authorId(value.id);
}
function isEvalMatrix(registration) {
	return "kind" in registration && registration.kind === "matrix";
}
function isEvalSuite(registration) {
	return !isEvalMatrix(registration) && "evals" in registration;
}
/**
* Creates an explicit, statically imported eval registry. A suite is a
* path-like grouping of evals; nesting is presentation derived from its ID.
*/
function registerEvals(registrations) {
	const byId = /* @__PURE__ */ new Map();
	const suiteById = /* @__PURE__ */ new Map();
	const suiteIdByEvalId = /* @__PURE__ */ new Map();
	const standalone = [];
	const matrices = [];
	for (const registration of registrations) {
		if (isEvalMatrix(registration)) {
			const id = authoringId(registration);
			if (matrices.some((matrix) => authoringId(matrix) === id)) throw new Error(`Eval registry contains duplicate matrix ID: ${id}`);
			matrices.push(registration);
			continue;
		}
		const suite = isEvalSuite(registration) ? registration : void 0;
		if (suite) {
			const id = authoringId(suite);
			if (suiteById.has(id)) throw new Error(`Eval registry contains duplicate suite ID: ${id}`);
			suiteById.set(id, suite);
		}
		const evaluations = suite ? suite.evals : [registration];
		for (const evaluation of evaluations) {
			const id = authoringId(evaluation);
			if (byId.has(id)) throw new Error(`Eval registry contains duplicate eval ID: ${id}`);
			byId.set(id, evaluation);
			if (suite) suiteIdByEvalId.set(id, suite);
			else standalone.push(evaluation);
		}
	}
	const evals = [...standalone, ...Array.from(suiteById.values()).flatMap((suite) => suite.evals)];
	return {
		evals,
		suites: [...suiteById.values()],
		matrices,
		get: (id) => byId.get(id),
		getSuite: (id) => suiteById.get(id),
		metadata: () => evals.map((evaluation) => {
			const suite = suiteIdByEvalId.get(authoringId(evaluation));
			return {
				id: evaluation.id,
				...evaluation.name ? { name: evaluation.name } : {},
				...suite ? { suiteId: suite.id } : {}
			};
		}),
		suiteMetadata: () => [...suiteById.values()].map((suite) => ({
			id: suite.id,
			evalIds: suite.evals.map(authoringId),
			...suite.name ? { name: suite.name } : {}
		})),
		catalog: () => evals.map((evaluation) => {
			const suite = suiteIdByEvalId.get(authoringId(evaluation));
			const identity = evaluation.agent.identity;
			return {
				id: evaluation.id,
				path: suite ? `${suite.id}#${evaluation.id}` : evaluation.id,
				...evaluation.name ? { name: evaluation.name } : {},
				...suite ? { suiteId: suite.id } : {},
				agent: {
					...identity?.name ? { name: identity.name } : {},
					kind: identity?.kind ?? "adapter",
					...identity?.id ? { id: identity.id } : {},
					...identity?.version ? { version: identity.version } : {},
					runtimes: Object.entries(evaluation.agent.runtimes ?? {}).map(([name, runtime]) => ({
						name,
						kind: runtime.kind
					}))
				},
				fixtures: (evaluation.fixtures ?? []).map((fixture) => fixture.kind === "dynamic" ? {
					kind: "dynamic",
					source: "dynamic"
				} : fixture.kind === "inline" ? {
					kind: "inline",
					source: fixture.file,
					destination: fixture.file,
					visibility: fixture.visibility
				} : {
					kind: fixture.kind,
					source: fixture.src,
					destination: fixture.dst,
					visibility: fixture.visibility
				}),
				trialCount: evaluation.policy?.trials ?? 1,
				scorers: evaluation.scoring.map(({ name, kind }) => ({
					name,
					kind
				}))
			};
		})
	};
}
function recordError(error) {
	if (error instanceof Error) return {
		name: error.name,
		message: error.message,
		...error.stack ? { stack: error.stack } : {}
	};
	return {
		name: "Error",
		message: String(error)
	};
}
//#endregion
export { TrialManifestSchema as A, authorId as B, RecordedErrorSchema as C, RunSummarySchema as D, RunStatusSchema as E, canonicalParameters as F, resourceUri as H, defineEvalMatrix as I, ResourceKindSchema as L, TrialScoringSchema as M, TrialSummarySchema as N, ScoreResultSchema as O, UsageSchema as P, ResourceUriSchema as R, JudgeRunInfoSchema as S, RunMetadataSchema as T, resourceUriSchema as U, parseResourceUri as V, resourceUuid as W, ApiErrorSchema as _, defineSuite as a, CheckpointResultSchema as b, expectToolCall as c, judge as d, predicate as f, parseTrajectoryJsonl as g, user as h, defineEval as i, TrialMetadataSchema as j, TrajectoryEventSchema as k, file as l, registerEvals as m, authoringId as n, directory as o, recordError as p, defineAgent as r, dynamic as s, agent as t, inlineFile as u, ArtifactEntrySchema as v, RunManifestSchema as w, JsonValueSchema as x, AutIdentitySchema as y, UuidSchema as z };

//# sourceMappingURL=src-D9EZ9WiG.mjs.map