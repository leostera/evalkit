import { Table, Tabs } from '@cloudflare/kumo';
import { passMark, type JudgeAnswer } from '@evalkit/core/judge';
import { turnTokens } from '@evalkit/core/usage';
import { useState, type ReactNode } from 'react';
import type { CatalogScorer, VerdictDetail } from '../api.js';
import { NestedTable } from './DataTable.js';
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
    .map((item) => `${item.weight ?? 1}×${formatValue(item.value)}`)
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
        <CriteriaTable criteria={result.criteria} />
      ) : null}
      {facts.length ? (
        <p className="text-xs text-kumo-subtle">
          {judge?.agent ? `${judge.agent.name ?? judge.agent.id} · ` : ''}
          {facts.join(' · ')}
        </p>
      ) : null}
      <VerdictSources result={result} />
    </div>
  );
}

function CriteriaTable({
  criteria,
}: {
  criteria: NonNullable<VerdictDetail['criteria']>;
}) {
  return (
    <NestedTable wrap>
      <Table.Header variant="compact">
        <Table.Row>
          <Table.Head>Criterion</Table.Head>
          <Table.Head>Weight</Table.Head>
          <Table.Head>Value</Table.Head>
          <Table.Head>Note</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {criteria.map((item) => (
          <Table.Row key={item.name}>
            <Table.Cell>{item.name}</Table.Cell>
            <Table.Cell className="tabular-nums">{item.weight ?? 1}</Table.Cell>
            <Table.Cell className="tabular-nums">
              {formatValue(item.value)}
            </Table.Cell>
            <Table.Cell className="text-kumo-subtle">
              {item.note ?? '—'}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </NestedTable>
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
