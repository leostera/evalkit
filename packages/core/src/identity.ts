import * as Schema from 'effect/Schema';

export const ResourceKindSchema = Schema.Literal(
  'suite',
  'eval',
  'agent',
  'fixture',
  'run',
  'trial',
  'artifact',
);
export type ResourceKind = typeof ResourceKindSchema.Type;

/** RFC 4122 textual UUID. Evalkit accepts v4/v7 and other valid UUID versions. */
export const UuidSchema = Schema.String.pipe(
  Schema.pattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ),
);
export type Uuid = typeof UuidSchema.Type;

export type ResourceUri<TKind extends ResourceKind = ResourceKind> =
  `evalkit:${TKind}:${string}`;

export function resourceUri<TKind extends ResourceKind>(
  kind: TKind,
  uuid: Uuid,
): ResourceUri<TKind> {
  return `evalkit:${kind}:${uuid}`;
}

export function parseResourceUri<TKind extends ResourceKind>(
  value: string,
  expectedKind?: TKind,
): { kind: TKind; uuid: Uuid; uri: ResourceUri<TKind> } {
  const match =
    /^evalkit:(suite|eval|agent|fixture|run|trial|artifact):(.+)$/.exec(value);
  if (!match) throw new Error(`Invalid Evalkit resource URI: ${value}`);
  const kind = match[1] as TKind;
  if (expectedKind && kind !== expectedKind)
    throw new Error(
      `Expected an Evalkit ${expectedKind} URI; received ${value}`,
    );
  const uuid = Schema.decodeUnknownSync(UuidSchema)(match[2]) as Uuid;
  return { kind, uuid, uri: resourceUri(kind, uuid) };
}

export function resourceUuid(value: string, expectedKind?: ResourceKind): Uuid {
  return parseResourceUri(value, expectedKind).uuid;
}
