import { defineDataset } from '@evalkit/core';

/** The help center the agent answers from, copied to help-center/ in each workspace. */
export const helpCenter = defineDataset({
  id: 'help-center',
  name: 'Help center articles',
  files: 'datasets/help-center',
});

type Customer = { name: string; plan: 'free' | 'pro' };

/**
 * Customers, built once per process (as an expensive fetch would be) and
 * cached; each trial gets one, chosen by its seed.
 */
export const customers = defineDataset({
  id: 'customers',
  name: 'Customers',
  async onLoad() {
    const names = ['Ada', 'Grace', 'Alan', 'Barbara', 'Edsger', 'Margaret'];
    const all: Customer[] = names.map((name, index) => ({
      name,
      plan: index % 2 ? 'pro' : 'free',
    }));
    return { value: all };
  },
  onRun(loaded, trial) {
    const all = loaded.value;
    const customer = all[Math.abs(trial.seed) % all.length]!;
    return {
      value: customer,
      files: { 'customer.json': JSON.stringify(customer) },
    };
  },
});

/** What a hand-off to a person must say; only scorers see it. */
export const escalationPolicy = defineDataset({
  id: 'escalation-policy',
  visibility: 'evaluator',
  value: { handoff: 'connect you with a person' },
});
