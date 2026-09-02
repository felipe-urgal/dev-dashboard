#!/usr/bin/env node

import { readFileSync } from 'node:fs';

function loadBlockers() {
  try {
    const manifest = JSON.parse(
      readFileSync(
        new URL('../.dev-dashboard/production.json', import.meta.url),
        'utf8',
      ),
    );
    const blockers = manifest?.production?.blockedBy;
    if (
      !Array.isArray(blockers) ||
      blockers.length === 0 ||
      blockers.some(
        (blocker) => typeof blocker !== 'string' || blocker.length === 0,
      )
    ) {
      throw new Error('blockedBy inválido');
    }
    return blockers;
  } catch {
    console.error(
      'Contrato de self-production inválido; habilitação permanece bloqueada.',
    );
    process.exit(1);
  }
}

const blockers = loadBlockers();
const mode = process.argv[2] ?? 'check';

if (mode === 'status') {
  console.log(
    'Self-production do Dev Dashboard ainda está bloqueada por contrato.',
  );
  console.log(`Blockers: ${blockers.join(', ')}`);
  process.exit(0);
}

if (mode !== 'check') {
  console.error('Uso: node scripts/production-gate.mjs <status|check>');
  process.exit(2);
}

console.error(
  'Self-production do Dev Dashboard não está pronta para habilitação.',
);
console.error(`Resolva antes: ${blockers.join(', ')}`);
process.exit(1);
