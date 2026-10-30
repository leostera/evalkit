import { Button, Tabs, cn } from '@cloudflare/kumo';
import {
  CaretRightIcon,
  FlagIcon,
  GearSixIcon,
  QuestionIcon,
  RobotIcon,
  SignOutIcon,
  SkipForwardIcon,
  UserIcon,
  WarningOctagonIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import type { TrajectoryEvent } from '../api.js';
import { StatusBadge } from './StatusBadge.js';
import {
  formatDuration,
  formatUsage,
  trajectoryView,
  type EventError,
  type ScorerRun,
  type TrajectoryItem,
  type TrajectoryTurn,
} from './trajectory-view.js';

type Mode = 'conversation' | 'events';

/** A trial's trajectory: the conversation by default, every raw event on demand. */
export function Trajectory({ events }: { events: TrajectoryEvent[] }) {
  const [mode, setMode] = useState<Mode>('conversation');
  const view = trajectoryView(events);
  return (
    <section className="trajectory flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-kumo-strong">Trajectory</h3>
        <Tabs
          variant="segmented"
          size="sm"
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          tabs={[
            { value: 'conversation', label: 'Conversation' },
            { value: 'events', label: `All events (${events.length})` },
          ]}
        />
      </header>
      {mode === 'events' ? (
        <RawEvents events={events} />
      ) : (
        <div className="flex flex-col">
          {view.preamble.length ? <Timeline items={view.preamble} /> : null}
          {view.turns.map((turn, index) => (
            <Turn key={index} turn={turn} index={index} />
          ))}
          {!events.length ? (
            <p className="text-[13px] text-kumo-subtle">No events recorded.</p>
          ) : (
            <Finish durationMs={view.durationMs} scorers={view.scorers} />
          )}
        </div>
      )}
    </section>
  );
}

function Turn({ turn, index }: { turn: TrajectoryTurn; index: number }) {
  const meta = [
    turn.latencyMs === undefined ? undefined : formatDuration(turn.latencyMs),
    turn.usage ? formatUsage(turn.usage) : undefined,
  ].filter(Boolean);
  return (
    <section
      className="turn border-t border-kumo-line pt-3 pb-4 first:border-t-0 first:pt-0"
      aria-label={`Turn ${turn.turn ?? index + 1}`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <h4 className="font-medium text-kumo-strong">
          Turn {turn.turn ?? index + 1}
        </h4>
        {meta.length ? (
          <span className="text-kumo-subtle tabular-nums">
            {meta.join(' · ')}
          </span>
        ) : null}
      </header>
      <Timeline items={turn.items} />
    </section>
  );
}

function Timeline({ items }: { items: TrajectoryItem[] }) {
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-kumo-line">
      {items.map((item, index) => (
        <li key={index} className={`trajectory-item item-${item.type}`}>
          <Item item={item} />
        </li>
      ))}
    </ol>
  );
}

/** Icon on the rail, content, and the time since the trial started. */
function Row({
  icon,
  tone = 'default',
  label,
  at,
  children,
}: {
  icon: ReactNode;
  tone?: 'default' | 'danger' | 'muted';
  label: ReactNode;
  at?: number;
  children?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span
        className={cn(
          'relative z-10 flex size-6 items-center justify-center rounded-full border border-kumo-line bg-kumo-base text-[13px]',
          tone === 'danger' && 'border-kumo-danger text-kumo-danger',
          tone === 'muted' ? 'text-kumo-subtle' : 'text-kumo-default',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
        <div className="flex min-h-5 items-baseline gap-2 text-xs">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
            {label}
          </div>
          {at === undefined ? null : (
            <time className="shrink-0 font-mono text-[11px] text-kumo-subtle tabular-nums">
              +{formatDuration(at)}
            </time>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Item({ item }: { item: TrajectoryItem }) {
  switch (item.type) {
    case 'user':
      return (
        <Row icon={<UserIcon />} label={<Label>User</Label>} at={item.at}>
          <Prose className="rounded-lg bg-kumo-elevated px-3 py-2">
            {item.text}
          </Prose>
        </Row>
      );
    case 'assistant':
      return (
        <Row icon={<RobotIcon />} label={<Label>Assistant</Label>} at={item.at}>
          <Content value={item.content} />
        </Row>
      );
    case 'message':
      return (
        <Row
          icon={<GearSixIcon />}
          tone="muted"
          label={<Label>{item.role} message</Label>}
          at={item.at}
        >
          <Content value={item.content} />
        </Row>
      );
    case 'tool':
      return <ToolCall item={item} />;
    case 'checkpoint':
      return (
        <Row
          icon={<FlagIcon />}
          tone={item.state === 'error' ? 'danger' : 'default'}
          label={
            <>
              <Label>Checkpoint</Label>
              <span className="text-[13px] text-kumo-default">{item.name}</span>
              <StatusBadge status={item.state} />
              {item.durationMs === undefined ? null : (
                <Meta>{formatDuration(item.durationMs)}</Meta>
              )}
            </>
          }
          at={item.at}
        >
          {item.error ? <ErrorText error={item.error} /> : null}
        </Row>
      );
    case 'skipped-step':
      return (
        <Row
          icon={<SkipForwardIcon />}
          tone="muted"
          label={
            <span className="text-kumo-subtle">
              Step {item.step + 1} skipped after a failed checkpoint
            </span>
          }
          at={item.at}
        />
      );
    case 'error':
      return (
        <Row
          icon={<WarningOctagonIcon />}
          tone="danger"
          label={
            <span className="font-semibold text-kumo-danger">
              {item.source === 'aut' ? 'Agent error' : 'Runner error'}
            </span>
          }
          at={item.at}
        >
          <ErrorText error={item.error} />
        </Row>
      );
    case 'output':
      return (
        <Row
          icon={<SignOutIcon />}
          label={<Label>Final output</Label>}
          at={item.at}
        >
          <Content value={item.output} />
        </Row>
      );
    case 'unknown': {
      const { source, kind, timestamp: _timestamp, ...rest } = item.event;
      return (
        <Row
          icon={<QuestionIcon />}
          tone="muted"
          label={
            <span className="text-kumo-subtle">
              {source} · <span className="font-mono">{kind}</span>
            </span>
          }
          at={item.at}
        >
          {Object.keys(rest).length ? <Json value={rest} /> : null}
        </Row>
      );
    }
  }
}

function ToolCall({
  item,
}: {
  item: Extract<TrajectoryItem, { type: 'tool' }>;
}) {
  const args = preview(item.arguments);
  return (
    <details className="tool-call group">
      <summary className="cursor-pointer list-none rounded-md select-none focus-visible:outline-2 focus-visible:outline-kumo-brand [&::-webkit-details-marker]:hidden">
        <Row
          icon={<WrenchIcon />}
          label={
            <>
              <CaretRightIcon
                aria-hidden
                className="self-center text-kumo-subtle transition-transform group-open:rotate-90"
              />
              <span className="font-mono text-[13px] font-medium text-kumo-strong">
                {item.name}
              </span>
              {args ? (
                <span className="min-w-0 truncate font-mono text-kumo-subtle">
                  {args}
                </span>
              ) : null}
              {item.result ? (
                <Meta>{formatDuration(item.result.durationMs)}</Meta>
              ) : (
                <span className="text-kumo-warning">no result</span>
              )}
            </>
          }
          at={item.at}
        >
          {item.result ? (
            <span className="line-clamp-2 font-mono text-xs break-words text-kumo-subtle group-open:hidden">
              → {preview(item.result.value, 240)}
            </span>
          ) : null}
        </Row>
      </summary>
      <div className="mt-2 ml-9 flex flex-col gap-2">
        {item.arguments === undefined ? null : (
          <Field label="Arguments">
            <Json value={item.arguments} />
          </Field>
        )}
        {item.result ? (
          <Field label="Result">
            <Json value={item.result.value} />
          </Field>
        ) : null}
      </div>
    </details>
  );
}

function Finish({
  durationMs,
  scorers,
}: {
  durationMs?: number;
  scorers: ScorerRun[];
}) {
  const failed = scorers.filter((scorer) => scorer.error).length;
  const parts = [
    durationMs === undefined
      ? undefined
      : `Finished in ${formatDuration(durationMs)}`,
    scorers.length
      ? `${scorers.length} final ${scorers.length === 1 ? 'scorer' : 'scorers'} ran${failed ? `, ${failed} errored` : ''}`
      : undefined,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="border-t border-kumo-line pt-3 text-xs text-kumo-subtle tabular-nums">
      {parts.join(' · ')}
    </p>
  );
}

function RawEvents({ events }: { events: TrajectoryEvent[] }) {
  const start = Date.parse(events[0]?.timestamp ?? '');
  return (
    <ol className="raw-events flex flex-col divide-y divide-kumo-line rounded-lg border border-kumo-line text-xs">
      {events.map((event, index) => {
        const { source, kind, timestamp, ...rest } = event;
        const at = Date.parse(timestamp) - start;
        const fields = Object.keys(rest).length ? JSON.stringify(rest) : '';
        return (
          <li key={`${timestamp}-${index}`}>
            <details className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[2rem_4rem_3rem_13rem_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-1.5 select-none hover:bg-kumo-elevated [&::-webkit-details-marker]:hidden">
                <span className="text-right font-mono text-kumo-subtle tabular-nums">
                  {index + 1}
                </span>
                <span className="font-mono text-kumo-subtle tabular-nums">
                  {Number.isNaN(at) ? '' : `+${formatDuration(at)}`}
                </span>
                <span className="text-kumo-subtle">{source}</span>
                <span className="font-mono text-kumo-strong">{kind}</span>
                <span className="truncate font-mono text-kumo-subtle">
                  {fields}
                </span>
              </summary>
              <div className="px-3 pb-2">
                <Json value={event} />
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold text-kumo-strong first-letter:uppercase">
      {children}
    </span>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <span className="text-kumo-subtle tabular-nums">{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-kumo-subtle">{label}</span>
      {children}
    </div>
  );
}

function ErrorText({ error }: { error: EventError }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] text-kumo-danger">
        {error.name && error.name !== 'Error' ? `${error.name}: ` : ''}
        {error.message}
      </p>
      {error.stack ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-kumo-subtle select-none">
            Stack trace
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono text-[11px]">
            {error.stack}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Messages are prose; structured content is shown as JSON. */
function Content({ value }: { value: unknown }) {
  return typeof value === 'string' ? (
    <Prose>{value}</Prose>
  ) : (
    <Json value={value} />
  );
}

const CLAMP_CHARS = 1200;
const CLAMP_LINES = 16;

/** Long replies collapse to their opening lines until asked for. */
function Prose({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const long =
    children.length > CLAMP_CHARS || children.split('\n').length > CLAMP_LINES;
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn('flex max-w-[75ch] flex-col items-start gap-1', className)}
    >
      <p
        className={cn(
          'text-[13px] leading-relaxed break-words whitespace-pre-wrap text-kumo-default',
          long && !open && 'line-clamp-[12]',
        )}
      >
        {children}
      </p>
      {long ? (
        <Button size="xs" variant="ghost" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : `Show all ${children.split('\n').length} lines`}
        </Button>
      ) : null}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-96 overflow-auto rounded-md bg-kumo-elevated px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-kumo-default">
      {text}
    </pre>
  );
}

/** `article: "plans", limit: 3`, cut to fit one line. */
function preview(value: unknown, max = 120): string {
  if (value === undefined) return '';
  const text =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.entries(value)
          .map(([key, entry]) => `${key}: ${JSON.stringify(entry)}`)
          .join(', ')
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
