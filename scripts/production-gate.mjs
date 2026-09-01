#!/usr/bin/env node

const blockers = [
  'external-helper-not-implemented',
  'self-restart-handoff-not-implemented',
  'production-health-not-validated',
  'privilege-model-not-validated',
];

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
