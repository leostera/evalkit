#!/usr/bin/env bun

const command = process.argv[2] ?? 'help';

if (command === 'help' || command === '--help') {
  console.log(`evalkit\n\nCommands:\n  init    Create an eval configuration\n  run     Run the configured eval suite\n`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
