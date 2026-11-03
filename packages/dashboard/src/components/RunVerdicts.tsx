import { CaretRightIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  CatalogEval,
  CatalogScorer,
  RunDetail as RunDetailData,
} from '../api.js';
import { checkpointScorer } from './library-entities.js';
import { StatusBadge } from './StatusBadge.js';
import {
  passText,
  shownValue,
  verdictStatus,
  VerdictPanel,
  type VerdictResult,
} from './Verdict.js';

/** A verdict's key in the URL (`?verdict=step-2`, `?verdict=score:history`). */
export const checkpointKey = (step: number) => `step-${step + 1}`;
export const scoreKey = (name: string) => `score:${name}`;

/** Which verdict the URL points at, and how to point it at another. */
export function useVerdictFocus(): [string | undefined, (key: string) => void] {
  const [params, setParams] = useSearchParams();
  const focused = params.get('verdict') ?? undefined;
  const focus = (key: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('verdict', key);
        return next;
      },
      { replace: true },
    );
  return [focused, focus];
}

type Entry = {
  key: string;
  /** Where it ran: `Step 2` for a checkpoint, `Final` for a scorer. */
  where: string;
  kind?: string;
  result: VerdictResult;
  scorer?: CatalogScorer;
};

const RANK: Record<string, number> = {
  error: 0,
  failed: 1,
  'not scored': 2,
  passed: 3,
  skipped: 4,
};

/** Checkpoints and final scorers in one list, failures first, then in run order. */
export function verdictEntries(
  detail: RunDetailData,
  scenario: CatalogEval | undefined,
): Entry[] {
  const entries: Entry[] = [
    ...(detail.checkpoints ?? []).map((check) => ({
      key: checkpointKey(check.step),
      where: `Step ${check.step + 1}`,
      kind: check.kind,
      result: {
        ...check,
        ...(check.status === 'skipped' ? { skipped: true as const } : {}),
      },
      scorer: checkpointScorer(scenario, check.step, check.name),
    })),
    ...detail.scores.map((score) => ({
      key: scoreKey(score.name),
      where: 'Final',
      kind: score.kind,
      result: score,
      scorer: scenario?.scorers.find((entry) => entry.name === score.name),
    })),
  ];
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        (RANK[verdictStatus(a.entry.result)] ?? 2) -
          (RANK[verdictStatus(b.entry.result)] ?? 2) || a.index - b.index,
    )
    .map(({ entry }) => entry);
}

const failing = (result: VerdictResult) =>
  result.passed === false || Boolean(result.error);

/**
 * Every verdict of the run as a card that opens to say why: failed and
 * errored ones first and open, so the reason is on screen beside what the
 * agent did. The one the URL names opens and scrolls into view.
 */
export function VerdictList({
  detail,
  scenario,
}: {
  detail: RunDetailData;
  scenario?: CatalogEval;
}) {
  const entries = verdictEntries(detail, scenario);
  const [focused] = useVerdictFocus();
  if (!entries.length && !detail.skippedScorers?.length)
    return (
      <p className="text-[13px] text-kumo-subtle">
        This scenario has no scorers or checkpoints.
      </p>
    );
  return (
    <ol className="verdicts flex flex-col gap-2">
      {entries.map((entry) => (
        <VerdictCard
          key={entry.key}
          entry={entry}
          focused={focused === entry.key}
        />
      ))}
      {(detail.skippedScorers ?? []).map((name) => (
        <li
          key={`not-run-${name}`}
          className="flex items-center gap-2 rounded-md border border-dashed border-kumo-line px-3 py-2 text-[13px] text-kumo-subtle"
        >
          <span className="text-xs">Final</span>
          <span className="text-kumo-default">{name}</span>
          <span className="ml-auto text-xs">
            not run: the run stopped early
          </span>
        </li>
      ))}
    </ol>
  );
}

function VerdictCard({ entry, focused }: { entry: Entry; focused: boolean }) {
  const { result, scorer } = entry;
  const [open, setOpen] = useState(failing(result) || focused);
  const card = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!focused) return;
    // oxlint-disable-next-line react/set-state-in-effect
    setOpen(true);
    card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);
  const status = verdictStatus(result);
  const kind =
    entry.kind === 'judge'
      ? 'LLM judge'
      : entry.kind === 'expect-tool-call'
        ? 'tool call'
        : entry.kind;
  return (
    <li
      ref={card}
      id={`verdict-${entry.key}`}
      data-verdict={entry.key}
      data-status={status}
      className={`verdict-card rounded-md border bg-kumo-base ${
        focused ? 'border-kumo-brand' : 'border-kumo-line'
      }`}
    >
      <button
        type="button"
        className="verdict-toggle flex w-full items-start gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} why ${result.name} ${status}`}
        onClick={() => setOpen(!open)}
      >
        <CaretRightIcon
          aria-hidden
          className={`mt-1 shrink-0 text-kumo-subtle transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-kumo-subtle">
            {entry.where}
            {kind ? ` · ${kind}` : ''}
          </span>
          <span className="block text-[13px] font-medium text-kumo-strong">
            {result.name}
          </span>
          {scorer?.description ? (
            <span className="block text-xs text-kumo-subtle">
              {scorer.description}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <StatusBadge status={status} />
          {!result.error && !result.skipped && result.value !== undefined ? (
            <span className="text-xs text-kumo-subtle tabular-nums">
              {shownValue(result)}
              {result.passAt !== undefined
                ? ` · passes at ${passText(result.passAt, scorer?.answer)}`
                : ''}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div className="border-t border-kumo-hairline px-3 py-2">
          <VerdictPanel result={result} scorer={scorer} />
        </div>
      ) : null}
    </li>
  );
}
