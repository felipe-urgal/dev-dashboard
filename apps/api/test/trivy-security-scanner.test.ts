import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTrivySecurityReport } from '../src/services/trivy-security-scanner.js';

const OBSERVED_AT = '2026-09-05T18:00:00.000Z';

test('normaliza secret sem transportar match, código ou valor bruto', () => {
  const secretValue = 'super-secret-token-value';
  const result = parseTrivySecurityReport(
    {
      Results: [
        {
          Target: 'scripts/deploy.sh',
          Secrets: [
            {
              RuleID: 'generic-api-key',
              Title: 'Generic API Key',
              Severity: 'HIGH',
              StartLine: 18,
              Match: secretValue,
              Code: { Lines: [{ Content: `TOKEN=${secretValue}` }] },
            },
          ],
        },
      ],
    },
    OBSERVED_AT,
  );

  assert.equal(result.findings.length, 1);
  assert.deepEqual(result.findings[0], {
    provider: 'trivy',
    category: 'secret',
    ruleId: 'generic-api-key',
    severity: 'high',
    title: 'Generic API Key',
    file: 'scripts/deploy.sh',
    line: 18,
    fingerprint: result.findings[0]?.fingerprint,
    observedAt: OBSERVED_AT,
  });
  assert.ok(result.findings[0]?.fingerprint);
  assert.equal(JSON.stringify(result).includes(secretValue), false);
  assert.equal(JSON.stringify(result).includes('TOKEN='), false);
});

test('normaliza misconfiguration somente com campos públicos allowlisted', () => {
  const result = parseTrivySecurityReport(
    {
      Results: [
        {
          Target: 'Dockerfile',
          Misconfigurations: [
            {
              ID: 'DS002',
              Severity: 'MEDIUM',
              Title: 'USER não definido',
              StartLine: 12,
              Resolution: 'Defina um usuário não-root.',
              PrimaryURL: 'https://example.test/rules/DS002',
              CauseMetadata: { Code: { Lines: [{ Content: 'ENV TOKEN=secret' }] } },
            },
          ],
        },
      ],
    },
    OBSERVED_AT,
  );

  assert.equal(result.findings[0]?.category, 'misconfiguration');
  assert.equal(result.findings[0]?.severity, 'medium');
  assert.equal(result.findings[0]?.remediation, 'Defina um usuário não-root.');
  assert.equal(result.findings[0]?.reference, 'https://example.test/rules/DS002');
  assert.equal(JSON.stringify(result).includes('ENV TOKEN=secret'), false);
});

test('rejeita targets absolutos ou que escapem do projeto', () => {
  const result = parseTrivySecurityReport(
    {
      Results: [
        { Target: '/etc/passwd', Secrets: [{ RuleID: 'x', Severity: 'HIGH' }] },
        { Target: '../outside.txt', Secrets: [{ RuleID: 'y', Severity: 'HIGH' }] },
        { Target: './inside.txt', Secrets: [{ RuleID: 'z', Severity: 'LOW' }] },
      ],
    },
    OBSERVED_AT,
  );

  assert.deepEqual(result.findings.map((finding) => finding.file), ['inside.txt']);
});

test('payload inválido falha fechado sem inventar finding', () => {
  assert.throws(
    () => parseTrivySecurityReport(null, OBSERVED_AT),
    /Relatório Trivy inválido/,
  );
});
