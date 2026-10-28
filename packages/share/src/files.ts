/** Where uploaded result files live: R2 in a Worker, a directory elsewhere. */
export type ShareFiles = {
  get(key: string): Promise<ReadableStream<Uint8Array> | Uint8Array | null>;
  put(key: string, data: Uint8Array | string): Promise<void>;
  /** Every key below `prefix`, in no particular order. */
  list(prefix: string): AsyncIterable<string>;
};

/** The subset of the Workers R2 binding used here. */
export type R2BucketLike = {
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>;
  put(key: string, value: Uint8Array | string): Promise<unknown>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
};

export function r2Files(bucket: R2BucketLike): ShareFiles {
  return {
    async get(key) {
      return (await bucket.get(key))?.body ?? null;
    },
    async put(key, data) {
      await bucket.put(key, data);
    },
    async *list(prefix) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        for (const object of page.objects) yield object.key;
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}
