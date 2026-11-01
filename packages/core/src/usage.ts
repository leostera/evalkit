/**
 * Token usage an agent reports for one turn. EvalKit never measures or infers
 * it; adapters copy it from their provider.
 */
export type Usage = {
  /**
   * Every input token the model read this turn: the prompt, history and tool
   * results, **including** tokens read from or written to a prompt cache.
   * (Some providers report cached tokens separately; add them in.)
   */
  inputTokens?: number;
  /** Every token the model produced, including reasoning tokens. */
  outputTokens?: number;
  /** Of `inputTokens`, how many were read from a prompt cache. Informational. */
  cachedInputTokens?: number;
  /** The provider's own total; used only when input and output are not reported. */
  totalTokens?: number;
};

/**
 * The tokens a turn counts toward the `tokens` metric: `inputTokens +
 * outputTokens` (cached input included), or `totalTokens` when neither is
 * reported. Undefined when the turn reported no usage.
 */
export function turnTokens(usage: Usage | undefined): number | undefined {
  if (!usage) return undefined;
  if (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
    return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return usage.totalTokens;
}
