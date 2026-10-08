import { describe, expect, test } from 'bun:test';
import { starterFiles } from '../packages/cli/src/new-project-template';
import {
  heroDefinition,
  scaffoldCommand,
  setupCommands,
} from '../www/src/content/snippets';

function tokens(source: string): string[] {
  // Compare identifiers, literals and punctuation independently of layout.
  // Preserve quoted strings verbatim; only formatting/trailing commas differ.
  return (
    source.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[\w$]+|[^\s]/g) ?? []
  ).filter((token) => token !== ',');
}

describe('homepage examples', () => {
  test('the public example matches the generated starter', () => {
    expect(tokens(heroDefinition)).toEqual(
      tokens(starterFiles['evals/greeting.eval.ts']!),
    );
    expect(heroDefinition).toContain("from '@leostera/evalkit'");
    expect(heroDefinition).not.toContain('@evalkit/core');
  });

  test('setup includes installation before running the starter', () => {
    expect(setupCommands.split('\n')).toEqual([
      scaffoldCommand,
      'cd evals',
      'bun install',
      'bun run check',
      'bun run evals',
      'bun run dashboard',
    ]);
  });
});
