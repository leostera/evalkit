import { Effect, Either } from 'effect';

/** Keep tagged Effect failures intact when bridging into the legacy async reporting lifecycle. Defects still reject. */
export async function runBoundary<A, E>(
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const outcome = await Effect.runPromise(Effect.either(effect));
  if (Either.isLeft(outcome)) throw outcome.left;
  return outcome.right;
}
