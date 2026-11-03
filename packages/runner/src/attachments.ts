import {
  DEFAULT_ATTACHMENT_LIMITS,
  type ScoringContext,
  type AttachmentEntry,
  type AttachmentLimits,
  type RunWriter,
} from '@evalkit/core';

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const MAX_NAME = 200;

/**
 * Checks an attachment name: a relative path whose segments are letters,
 * digits, `.`, `_` and `-`, not starting with a dot. That rules out
 * absolute paths, `..`, hidden files, separators other than `/`, and
 * anything a filesystem or URL would read differently.
 */
export function attachmentName(name: string): string {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > MAX_NAME ||
    !name.split('/').every((segment) => SEGMENT.test(segment))
  )
    throw new Error(
      `Attachment name ${JSON.stringify(name)} is not allowed: use a relative path of letters, digits, ".", "_" and "-", like "logs/agent.log"`,
    );
  return name;
}

/** The last `max` bytes, starting on a whole UTF-8 character when the content is text. */
function lastBytes(bytes: Uint8Array, max: number, text: boolean): Uint8Array {
  let start = bytes.byteLength - max;
  // Skip UTF-8 continuation bytes (10xxxxxx) so text does not start mid-character.
  if (text)
    while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) start++;
  return bytes.subarray(start);
}

export type AttachmentStore = {
  attach(name: string, content: string | Uint8Array): Promise<void>;
  /** Stops accepting attachments and waits for pending writes; returns what was saved. */
  close(): Promise<AttachmentEntry[]>;
};

/**
 * Saves a run's attachments as `attachments/<name>` below its artifacts.
 * Content is stored as given and never interpreted. A file over
 * `maxFileBytes` keeps its end (where a log's errors are); one that would
 * take the run past `maxRunBytes` is rejected.
 */
export function attachmentStore(
  writer: Pick<RunWriter, 'writeArtifact'>,
  limits: AttachmentLimits = {},
): AttachmentStore {
  const { maxFileBytes, maxRunBytes } = {
    ...DEFAULT_ATTACHMENT_LIMITS,
    ...limits,
  };
  const entries: AttachmentEntry[] = [];
  const names = new Set<string>();
  const pending = new Set<Promise<unknown>>();
  let used = 0;
  let closed = false;

  async function attach(
    name: string,
    content: string | Uint8Array,
  ): Promise<void> {
    if (closed)
      throw new Error(
        `Cannot attach ${JSON.stringify(name)}: the run has finished`,
      );
    attachmentName(name);
    if (typeof content !== 'string' && !(content instanceof Uint8Array))
      throw new Error(
        `Attachment ${name} must be a string or a Uint8Array, not ${content === null ? 'null' : typeof content}`,
      );
    if (names.has(name))
      throw new Error(`Attachment ${name} was already attached`);
    const text = typeof content === 'string';
    const original = text ? new TextEncoder().encode(content) : content;
    const bytes =
      original.byteLength > maxFileBytes
        ? lastBytes(original, maxFileBytes, text)
        : original;
    if (used + bytes.byteLength > maxRunBytes)
      throw new Error(
        `Attachment ${name} (${bytes.byteLength} bytes) would take this run past its ${maxRunBytes}-byte attachment limit (${used} used)`,
      );
    // Reserve the name and space before writing, so concurrent calls cannot both fit.
    names.add(name);
    used += bytes.byteLength;
    const write = writer.writeArtifact(`attachments/${name}`, bytes);
    pending.add(write);
    try {
      await write;
      entries.push({
        name,
        size: bytes.byteLength,
        ...(bytes.byteLength < original.byteLength
          ? { truncatedFrom: original.byteLength }
          : {}),
      });
    } catch (error) {
      names.delete(name);
      used -= bytes.byteLength;
      throw error;
    } finally {
      pending.delete(write);
    }
  }

  return {
    attach,
    async close() {
      closed = true;
      await Promise.allSettled(pending);
      return [...entries].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

/**
 * An `attach` that remembers what it saved, so a score or checkpoint can
 * link the files its scorer attached, even when the scorer then failed.
 */
export function trackAttachments(attach: ScoringContext['attach']): {
  attach: ScoringContext['attach'];
  attached: string[];
} {
  const attached: string[] = [];
  return {
    attached,
    async attach(name, content) {
      await attach(name, content);
      attached.push(name);
    },
  };
}

/** `{ attachments }` when a scorer attached any. */
export const attachedFields = (attached: readonly string[]) =>
  attached.length ? { attachments: [...attached] } : {};
