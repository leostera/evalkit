import { B as ReportStore, F as JsonValue, Gt as EvalMatrixCell, H as RunResult, Kt as MatrixSelection, N as JsonObject, V as RunMetadata, Wt as EvalMatrix, Z as TrajectoryEvent, n as AgentRuntimeName, y as EvalDefinition } from "./index-BE3HM0UO.mjs";
import { Effect } from "effect";
//#region ../runner/src/errors.d.ts
declare const AutExecutionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "AutExecutionError";
} & Readonly<A>;
export declare class AutExecutionError extends AutExecutionError_base<{
  cause: unknown;
  message?: string;
}> {}
declare const FixtureError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "FixtureError";
} & Readonly<A>;
export declare class FixtureError extends FixtureError_base<{
  cause: unknown;
  message?: string;
}> {}
declare const ReportError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "ReportError";
} & Readonly<A>;
export declare class ReportError extends ReportError_base<{
  cause: unknown;
  message?: string;
}> {}
declare const ScoringError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "ScoringError";
} & Readonly<A>;
export declare class ScoringError extends ScoringError_base<{
  cause: unknown;
  message?: string;
}> {}
declare const CheckpointExecutionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "CheckpointExecutionError";
} & Readonly<A>;
export declare class CheckpointExecutionError extends CheckpointExecutionError_base<{
  step: number;
  name: string;
  message: string;
  cause: unknown;
}> {}
//#endregion
//#region ../runner/src/local-report-store.d.ts
/** Persists each run as a local tree rooted below `rootDirectory`. */
export declare function localReportStore(rootDirectory: string): ReportStore;
//#endregion
//#region ../runner/src/local-report-reader.d.ts
export declare const readRunManifest: (root: string, runId: string) => Promise<{
  readonly schemaVersion: 2 | 3;
  readonly runUri: string;
  readonly evalId: string;
  readonly suiteId?: string | undefined;
  readonly parameters?: {
    readonly [x: string]: JsonValue;
  } | undefined;
  readonly matrix?: {
    readonly id: string;
    readonly cellKey: string;
  } | undefined;
  readonly aut?: {
    readonly name?: string | undefined;
    readonly kind: string;
    readonly id: string;
    readonly version?: string | undefined;
  } | undefined;
  readonly startedAt: string;
  readonly status?: "cancelled" | "completed" | "failed" | "running" | undefined;
}>;
export declare const readRunSummary: (root: string, runId: string) => Promise<{
  readonly status: "cancelled" | "completed" | "failed" | "running";
  readonly endedAt: string;
  readonly durationMs?: number | undefined;
  readonly trialCount: number;
  readonly passed: number;
  readonly failed: number;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string | undefined;
  } | undefined;
}>;
export declare const readTrialManifest: (root: string, runId: string, trialId: string) => Promise<{
  readonly schemaVersion: 2 | 3;
  readonly runUri: string;
  readonly trialUri: string;
  readonly trialIndex: number;
  readonly evalId: string;
  readonly parameters?: {
    readonly [x: string]: JsonValue;
  } | undefined;
  readonly matrix?: {
    readonly id: string;
    readonly cellKey: string;
  } | undefined;
  readonly aut?: {
    readonly name?: string | undefined;
    readonly kind: string;
    readonly id: string;
    readonly version?: string | undefined;
  } | undefined;
  readonly startedAt: string;
  readonly status?: "cancelled" | "completed" | "failed" | "running" | undefined;
}>;
export declare const readTrialSummary: (root: string, runId: string, trialId: string) => Promise<{
  readonly status: "cancelled" | "completed" | "failed" | "running";
  readonly endedAt: string;
  readonly durationMs?: number | undefined;
  readonly scoring?: {
    readonly results: {
      readonly name: string;
      readonly kind: "judge" | "predicate";
      readonly value?: number | undefined;
      readonly passed?: boolean | undefined;
      readonly explanation?: string | undefined;
      readonly evidence?: JsonValue | undefined;
      readonly judge?: {
        readonly agent?: {
          readonly id: string;
          readonly kind: string;
          readonly name?: string | undefined;
          readonly version?: string | undefined;
        } | undefined;
        readonly usage?: {
          readonly inputTokens?: number | undefined;
          readonly outputTokens?: number | undefined;
          readonly totalTokens?: number | undefined;
        } | undefined;
        readonly events?: JsonValue[] | undefined;
      } | undefined;
      readonly durationMs: number;
      readonly error?: {
        readonly name: string;
        readonly message: string;
        readonly stack?: string | undefined;
      } | undefined;
    }[];
    readonly checkpoints?: {
      readonly step: number;
      readonly kind: "expect-tool-call" | "judge" | "predicate";
      readonly name: string;
      readonly status: "error" | "failed" | "passed" | "skipped";
      readonly value?: number | undefined;
      readonly passed?: boolean | undefined;
      readonly explanation?: string | undefined;
      readonly evidence?: JsonValue | undefined;
      readonly judge?: {
        readonly agent?: {
          readonly id: string;
          readonly kind: string;
          readonly name?: string | undefined;
          readonly version?: string | undefined;
        } | undefined;
        readonly usage?: {
          readonly inputTokens?: number | undefined;
          readonly outputTokens?: number | undefined;
          readonly totalTokens?: number | undefined;
        } | undefined;
        readonly events?: JsonValue[] | undefined;
      } | undefined;
      readonly durationMs?: number | undefined;
      readonly error?: {
        readonly name: string;
        readonly message: string;
        readonly stack?: string | undefined;
      } | undefined;
      readonly matchedToolCall?: {
        readonly eventIndex: number;
        readonly id: string;
      } | undefined;
    }[] | undefined;
    readonly skippedScorers?: string[] | undefined;
    readonly overall?: number | undefined;
    readonly passed: boolean;
  } | undefined;
  readonly artifacts?: {
    readonly path: string;
    readonly kind: "directory" | "file";
    readonly size?: number | undefined;
  }[] | undefined;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string | undefined;
  } | undefined;
}>;
export declare const readTrialScoring: (root: string, runId: string, trialId: string) => Promise<{
  readonly results: {
    readonly name: string;
    readonly kind: "judge" | "predicate";
    readonly value?: number | undefined;
    readonly passed?: boolean | undefined;
    readonly explanation?: string | undefined;
    readonly evidence?: JsonValue | undefined;
    readonly judge?: {
      readonly agent?: {
        readonly id: string;
        readonly kind: string;
        readonly name?: string | undefined;
        readonly version?: string | undefined;
      } | undefined;
      readonly usage?: {
        readonly inputTokens?: number | undefined;
        readonly outputTokens?: number | undefined;
        readonly totalTokens?: number | undefined;
      } | undefined;
      readonly events?: JsonValue[] | undefined;
    } | undefined;
    readonly durationMs: number;
    readonly error?: {
      readonly name: string;
      readonly message: string;
      readonly stack?: string | undefined;
    } | undefined;
  }[];
  readonly checkpoints?: {
    readonly step: number;
    readonly kind: "expect-tool-call" | "judge" | "predicate";
    readonly name: string;
    readonly status: "error" | "failed" | "passed" | "skipped";
    readonly value?: number | undefined;
    readonly passed?: boolean | undefined;
    readonly explanation?: string | undefined;
    readonly evidence?: JsonValue | undefined;
    readonly judge?: {
      readonly agent?: {
        readonly id: string;
        readonly kind: string;
        readonly name?: string | undefined;
        readonly version?: string | undefined;
      } | undefined;
      readonly usage?: {
        readonly inputTokens?: number | undefined;
        readonly outputTokens?: number | undefined;
        readonly totalTokens?: number | undefined;
      } | undefined;
      readonly events?: JsonValue[] | undefined;
    } | undefined;
    readonly durationMs?: number | undefined;
    readonly error?: {
      readonly name: string;
      readonly message: string;
      readonly stack?: string | undefined;
    } | undefined;
    readonly matchedToolCall?: {
      readonly eventIndex: number;
      readonly id: string;
    } | undefined;
  }[] | undefined;
  readonly skippedScorers?: string[] | undefined;
  readonly overall?: number | undefined;
  readonly passed: boolean;
}>;
export declare function readTrialEvents(root: string, runId: string, trialId: string): Promise<TrajectoryEvent[]>;
//#endregion
//#region ../runner/src/matrix.d.ts
/** Bounded workers pull cells from the iterator; no Cartesian job array is allocated. */
export declare function runMatrix(matrix: EvalMatrix, options: Omit<RunEvalOptions, 'runId' | 'trialId' | 'parameters' | 'matrix'> & {
  selection?: MatrixSelection;
  onResult?: (cell: EvalMatrixCell, result: RunResult) => void | Promise<void>;
}): Effect.Effect<{
  cells: number;
  passed: number;
  failed: number;
}, unknown>;
//#endregion
//#region ../runner/src/index.d.ts
export type RunEvalOptions = {
  report: ReportStore;
  runId?: string;
  trialId?: string;
  suiteId?: string;
  /** Overrides the eval policy's requested number of independent trials. */
  trials?: number;
  /** Parameters made available to the AUT for this invocation. */
  parameters?: JsonObject;
  /** Matrix provenance retained with every aggregate and trial manifest. */
  matrix?: RunMetadata['matrix'];
  /** Selects a declared AUT runtime such as local, sandbox, or remote. */
  runtime?: AgentRuntimeName;
  /** Maximum number of trials from this aggregate run executing concurrently. */
  concurrency?: number;
  /** Optional shared limiter for coordinating trials across aggregate runs. */
  semaphore?: Effect.Semaphore;
  /** Base directory for persistent local trial workspaces. Omit for an ephemeral OS temp workspace. */
  workspaceRoot?: string;
  now?: () => Date;
};
/** Effect-native aggregate eval execution entry point. */
export declare function runEval(definition: EvalDefinition, options: RunEvalOptions): Effect.Effect<RunResult, unknown>;
//#endregion
//# sourceMappingURL=runner.d.mts.map