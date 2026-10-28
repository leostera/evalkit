/**
 * A run bundle: the snapshot files for one run, as one gzip-compressed body.
 *
 *   "EKBUNDLE" (8 bytes) · header length (u32 BE) · header JSON · file bytes…
 *   header = { format: 1, files: [{ path, size }, …] }, bytes in that order.
 *
 * Both ends are EvalKit, so this is simpler than tar and has no path-length limit.
 */
export const BUNDLE_FORMAT = 1;
const MAGIC = new TextEncoder().encode('EKBUNDLE');

export type BundleFile = { path: string; data: Uint8Array };

async function pipe(
  data: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeBundle(files: BundleFile[]): Promise<Uint8Array> {
  const header = new TextEncoder().encode(
    JSON.stringify({
      format: BUNDLE_FORMAT,
      files: files.map(({ path, data }) => ({ path, size: data.byteLength })),
    }),
  );
  const total =
    MAGIC.length +
    4 +
    header.length +
    files.reduce((sum, file) => sum + file.data.byteLength, 0);
  const raw = new Uint8Array(total);
  raw.set(MAGIC, 0);
  new DataView(raw.buffer).setUint32(MAGIC.length, header.length);
  raw.set(header, MAGIC.length + 4);
  let offset = MAGIC.length + 4 + header.length;
  for (const file of files) {
    raw.set(file.data, offset);
    offset += file.data.byteLength;
  }
  return pipe(raw, new CompressionStream('gzip'));
}

export class BundleError extends Error {}

/** Decode and check the framing; path rules are enforced by the caller. */
export async function decodeBundle(
  body: Uint8Array,
  limits: { maxBytes: number },
): Promise<BundleFile[]> {
  let raw: Uint8Array;
  try {
    raw = await pipe(body, new DecompressionStream('gzip'));
  } catch {
    throw new BundleError('Body is not a gzip-compressed EvalKit bundle');
  }
  if (raw.byteLength > limits.maxBytes)
    throw new BundleError(`Bundle exceeds ${limits.maxBytes} bytes`);
  if (
    raw.byteLength < MAGIC.length + 4 ||
    MAGIC.some((byte, index) => raw[index] !== byte)
  )
    throw new BundleError('Not an EvalKit bundle');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const headerLength = view.getUint32(MAGIC.length);
  const start = MAGIC.length + 4;
  let header: { format?: unknown; files?: { path: unknown; size: unknown }[] };
  try {
    header = JSON.parse(
      new TextDecoder().decode(raw.subarray(start, start + headerLength)),
    );
  } catch {
    throw new BundleError('Bundle header is not valid JSON');
  }
  if (header.format !== BUNDLE_FORMAT)
    throw new BundleError(`Unsupported bundle format ${String(header.format)}`);
  if (!Array.isArray(header.files))
    throw new BundleError('Bundle header has no file list');
  let offset = start + headerLength;
  const files: BundleFile[] = [];
  for (const entry of header.files) {
    if (
      typeof entry.path !== 'string' ||
      typeof entry.size !== 'number' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      offset + entry.size > raw.byteLength
    )
      throw new BundleError('Bundle file list does not match its contents');
    files.push({
      path: entry.path,
      data: raw.subarray(offset, offset + entry.size),
    });
    offset += entry.size;
  }
  if (offset !== raw.byteLength)
    throw new BundleError('Bundle has trailing bytes');
  return files;
}
