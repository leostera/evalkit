/**
 * Auth helpers for the project-owned Worker control API.
 *
 * Keep the configured token in a Worker secret (`EVALKIT_API_TOKEN`), never in
 * source, Wrangler configuration, an image, a report, or a log.
 */
export async function hasBearerToken(
  request: Request,
  expectedToken: string | undefined,
): Promise<boolean> {
  if (!expectedToken) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization) return false;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return false;

  return constantTimeEqualUtf8(match[1], expectedToken);
}

/**
 * Compare fixed-length SHA-256 digests. Hashing avoids leaking the original
 * token length and the XOR loop avoids a short-circuiting string comparison.
 */
export async function constantTimeEqualUtf8(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}
