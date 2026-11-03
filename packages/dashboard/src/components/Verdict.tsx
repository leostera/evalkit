import { Tabs } from '@cloudflare/kumo';
import {
  criterionValue,
  passMark,
  type JudgeAnswer,
} from '@evalkit/core/judge';
import { turnTokens } from '@evalkit/core/usage';
import { useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogScorer, VerdictDetail } from '../api.js';
import { tableLinkClass } from './DataTable.js';
import { attachmentsHref } from './links.js';
import { RunFiles } from './run-files.js';
import { formatDuration } from './run-columns.js';

/** A score or checkpoint result, whatever was saved of it. */
export type VerdictResult = {
  name: string;
  value?: number;
  passed?: boolean;
  explanation?: string;
  error?: { name: string; message: string };
  skipped?: true;
} & VerdictDetail;

/** How a numeric pass mark reads: `only 1`, `≥ 0.5`, or the choices that pass. */
export function passText(
  passAt: number | undefined,
  answer?: JudgeAnswer,
): string {
  return passMark(passAt, answer);
}

/** The value as shown in tables: a choice with its value, or the number. */
export function shownValue(result: Pick<VerdictResult, 'value' | 'choice'>) {
  if (result.value === undefined) return '—';
  return result.choice
    ? `${result.choice} (${formatValue(result.value)})`
    : formatValue(result.value);
}

const formatValue = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');

/** Never reports a pass unless the scorer recorded one. */
export function verdictStatus(result: VerdictResult): string {
  if (result.error) return 'error';
  if (result.skipped) return 'skipped';
  if (result.passed === true) return 'passed';
  if (result.passed === false) return 'failed';
  return 'not scored';
}

/** What the verdict says, in one sentence: `Answered C (0), passes at A or B → failed`. */
export function verdictSentence(
  result: VerdictResult,
  answer?: JudgeAnswer,
): string {
  const status = verdictStatus(result);
  if (result.value === undefined) return status;
  const value = result.choice
    ? `Answered ${result.choice} (${formatValue(result.value)})`
    : formatValue(result.value);
  const mark =
    result.passAt === undefined
      ? ''
      : `, passes at ${passText(result.passAt, answer)}`;
  return `${value}${mark} → ${status}`;
}

/** `(2×1 + 2×1 + 1×0) / 5`: how criteria made the value. */
export function criteriaFormula(
  criteria: NonNullable<VerdictDetail['criteria']>,
): string {
  const weights = criteria.reduce((sum, item) => sum + (item.weight ?? 1), 0);
  const terms = criteria
    .map((item) => `${item.weight ?? 1}×${formatValue(criterionValue(item))}`)
    .join(' + ');
  return `weighted mean (${terms}) / ${formatValue(weights)}`;
}

/**
 * Why a score or checkpoint passed or failed: the verdict in words, the
 * explanation, criteria, what a judge saw and said, and the evidence.
 * Everything here may come from the agent or a model: it is shown as text.
 */
export function VerdictPanel({
  result,
  scorer,
}: {
  result: VerdictResult;
  /** Its definition, when the catalog still has it. */
  scorer?: CatalogScorer;
}) {
  const judge = result.judge;
  const tokens = judge?.usage ? turnTokens(judge.usage) : undefined;
  const facts = [
    judge?.model,
    tokens === undefined ? undefined : `${tokens.toLocaleString()} tokens`,
    result.durationMs === undefined
      ? undefined
      : formatDuration(result.durationMs),
    judge?.attempts && judge.attempts > 1
      ? 'asked twice: its first answer was not in the format asked for'
      : undefined,
  ].filter(Boolean);
  return (
    <div className="verdict-panel flex min-w-0 flex-col gap-2 text-[13px]">
      {result.error ? (
        <p className="text-kumo-danger">{result.error.message}</p>
      ) : result.skipped ? (
        <p className="text-kumo-subtle">
          Skipped{result.explanation ? `: ${result.explanation}` : ''}
        </p>
      ) : (
        <p className="verdict font-semibold text-kumo-strong">
          {verdictSentence(result, scorer?.answer)}
          {result.criteria?.length ? (
            <span className="font-normal text-kumo-subtle">
              {' '}
              · {criteriaFormula(result.criteria)}
            </span>
          ) : null}
        </p>
      )}
      {result.explanation && !result.skipped ? (
        <p className="whitespace-pre-wrap text-kumo-default">
          {result.explanation}
        </p>
      ) : null}
      {result.criteria?.length ? (
        <CriteriaTable criteria={result.criteria} answer={scorer?.answer} />
      ) : null}
      {facts.length ? (
        <p className="text-xs text-kumo-subtle">
          {judge?.agent ? `${judge.agent.name ?? judge.agent.id} · ` : ''}
          {facts.join(' · ')}
        </p>
      ) : null}
      <VerdictFiles result={result} />
      <VerdictSources result={result} />
    </div>
  );
}

/**
 * The files that explain a verdict: what its scorer attached (say, the app's
 * log from when it would not start) and, for one that did not pass, the
 * run's other attachments, such as the agent's transcript.
 */
function VerdictFiles({ result }: { result: VerdictResult }) {
  const { runId, attachments } = useContext(RunFiles);
  if (!runId) return null;
  const own = result.attachments ?? [];
  const others =
    result.passed === false || result.error
      ? attachments
          .map((attachment) => attachment.name)
          .filter((name) => !own.includes(name))
      : [];
  if (!own.length && !others.length) return null;
  const link = (name: string) => (
    <Link
      key={name}
      to={attachmentsHref(runId, name)}
      className={`${tableLinkClass} font-mono text-xs`}
    >
      {name}
    </Link>
  );
  return (
    <p className="verdict-files flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-kumo-subtle">
      {own.length ? (
        <>
          <span>Attached by this check:</span>
          {own.map(link)}
        </>
      ) : null}
      {others.length ? (
        <>
          <span>
            {own.length ? 'Run files:' : 'Run files that may explain it:'}
          </span>
          {others.map(link)}
        </>
      ) : null}
    </p>
  );
}

/** A criterion's state, for its dot: full marks, none, or not reached. */
function criterionState(item: NonNullable<VerdictDetail['criteria']>[number]) {
  if (!('value' in item)) return 'not reached';
  return item.value === 1 ? 'passed' : item.value === 0 ? 'failed' : 'partial';
}

const stateDot: Record<string, string> = {
  passed: 'bg-kumo-success',
  failed: 'bg-kumo-danger',
  partial: 'bg-kumo-warning',
  'not reached': 'border border-kumo-subtle bg-transparent',
};

/**
 * One row per criterion: its state, what it checks (when declared), its
 * value and why. A criterion with evidence opens to show it.
 */
function CriteriaTable({
  criteria,
  answer,
}: {
  criteria: NonNullable<VerdictDetail['criteria']>;
  answer?: JudgeAnswer;
}) {
  const declared = answer?.kind === 'criteria' ? answer.criteria : [];
  return (
    <ul className="criteria flex flex-col divide-y divide-kumo-hairline rounded-md border border-kumo-hairline">
      {criteria.map((item) => {
        const state = criterionState(item);
        const description = declared.find(
          (criterion) => criterion.name === item.name,
        )?.description;
        const evidence = 'evidence' in item ? item.evidence : undefined;
        const row = (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span
              aria-hidden
              className={`inline-block size-2 shrink-0 translate-y-[-1px] rounded-full ${stateDot[state]}`}
            />
            <span className="min-w-0 flex-1">
              <span className="text-kumo-strong">{item.name}</span>
              {description ? (
                <span className="text-kumo-subtle"> · {description}</span>
              ) : null}
              {item.explanation ? (
                <span className="block whitespace-pre-wrap text-kumo-default">
                  {item.explanation}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-kumo-subtle tabular-nums">
              {state === 'not reached'
                ? 'not reached'
                : formatValue(criterionValue(item))}
              {(item.weight ?? 1) !== 1 ? ` · weight ${item.weight}` : ''}
            </span>
          </span>
        );
        return (
          <li
            key={item.name}
            className={`criterion px-3 py-1.5 ${state === 'not reached' ? 'text-kumo-subtle' : ''}`}
            data-state={state}
          >
            {evidence === undefined ? (
              row
            ) : (
              <details open={state === 'failed'}>
                <summary className="flex cursor-pointer list-none items-baseline gap-2">
                  {row}
                  <span className="shrink-0 text-xs text-kumo-link">
                    evidence
                  </span>
                </summary>
                <div className="mt-1.5">
                  <Evidence value={evidence} />
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type Source = { value: string; label: string; body: ReactNode };

/** The prompt a judge saw, its reply and conversation, and the evidence: one tab each. */
function VerdictSources({ result }: { result: VerdictResult }) {
  const judge = result.judge;
  const sources: Source[] = [
    ...(judge?.prompt
      ? [
          {
            value: 'prompt',
            label: 'Prompt it saw',
            body: <Text value={judge.prompt} />,
          },
        ]
      : []),
    ...(judge?.reply !== undefined
      ? [
          {
            value: 'reply',
            label: 'Its reply',
            body: <Text value={judge.reply} />,
          },
        ]
      : []),
    ...(judge?.events?.length
      ? [
          {
            value: 'conversation',
            label: 'Judge conversation',
            body: <JudgeConversation events={judge.events} />,
          },
        ]
      : []),
    ...(result.evidence !== undefined
      ? [
          {
            value: 'evidence',
            label: 'Evidence',
            body: <Evidence value={result.evidence} />,
          },
        ]
      : []),
  ];
  const [tab, setTab] = useState(sources[0]?.value);
  if (!sources.length) return null;
  const current = sources.find((source) => source.value === tab) ?? sources[0]!;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {sources.length > 1 ? (
        <Tabs
          variant="segmented"
          size="sm"
          value={current.value}
          onValueChange={(value) => setTab(String(value))}
          tabs={sources.map(({ value, label }) => ({ value, label }))}
        />
      ) : (
        <p className="text-xs font-medium text-kumo-subtle">{current.label}</p>
      )}
      {current.body}
    </div>
  );
}

const preClass =
  'max-h-80 overflow-auto rounded-md border border-kumo-hairline bg-kumo-elevated px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words';

function Text({ value }: { value: unknown }) {
  return (
    <pre className={preClass}>
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Evidence as a tree to scan, or as the JSON it was saved as. */
function Evidence({ value }: { value: unknown }) {
  const [mode, setMode] = useState<'tree' | 'json'>(
    typeof value === 'object' && value !== null ? 'tree' : 'json',
  );
  return (
    <div className="flex flex-col gap-1">
      {typeof value === 'object' && value !== null ? (
        <div className="self-end">
          <Tabs
            variant="segmented"
            size="sm"
            value={mode}
            onValueChange={(next) => setMode(next as 'tree' | 'json')}
            tabs={[
              { value: 'tree', label: 'Tree' },
              { value: 'json', label: 'JSON' },
            ]}
          />
        </div>
      ) : null}
      {mode === 'json' ? (
        <Text value={value} />
      ) : (
        <div className={`${preClass} evidence-tree whitespace-normal`}>
          <JsonNode value={value} depth={0} />
        </div>
      )}
    </div>
  );
}

function JsonNode({
  name,
  value,
  depth,
}: {
  name?: string;
  value: unknown;
  depth: number;
}) {
  const label =
    name === undefined ? null : (
      <span className="text-kumo-subtle">{name}: </span>
    );
  if (typeof value !== 'object' || value === null)
    return (
      <div className="whitespace-pre-wrap">
        {label}
        <span className="text-kumo-strong">{JSON.stringify(value)}</span>
      </div>
    );
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  const summary = Array.isArray(value)
    ? `array · ${entries.length} ${entries.length === 1 ? 'item' : 'items'}`
    : `object · ${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`;
  return (
    <details open={depth < 2}>
      <summary className="cursor-pointer select-none">
        {label}
        <span className="text-kumo-subtle">{summary}</span>
      </summary>
      <div className="ml-4 border-l border-kumo-hairline pl-2">
        {entries.map(([key, item]) => (
          <JsonNode key={key} name={key} value={item} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

/** What the judge agent did, in order: its tool calls, results and replies. */
function JudgeConversation({ events }: { events: unknown[] }) {
  return (
    <ol className="flex flex-col gap-1.5 text-xs">
      {events.map((event, index) => {
        const entry = event as Record<string, unknown>;
        const line =
          entry.kind === 'message'
            ? `${String(entry.role)}: ${text(entry.content)}`
            : entry.kind === 'tool-call'
              ? `tool call ${String(entry.name)} ${text(entry.arguments)}`
              : entry.kind === 'tool-result'
                ? `tool result ${String(entry.name ?? entry.id)}: ${text(entry.result)}`
                : entry.kind === 'turn-completed'
                  ? `turn ${String(entry.turn)} done${entry.model ? ` · ${String(entry.model)}` : ''}`
                  : String(entry.kind);
        return (
          <li key={index} className={`${preClass} max-h-48`}>
            {line}
          </li>
        );
      })}
    </ol>
  );
}

const text = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value);
