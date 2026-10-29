import { describe, expect, it } from 'vitest';

import { buildRecoveryGuide } from '../src/utils/production-recovery';

describe('buildRecoveryGuide', () => {
  it('manda restaurar o backup quando o schema mudou e valida com restore-check', () => {
    const guide = buildRecoveryGuide({
      policy: 'restore-backup-when-schema-changed',
      hasBackupCommand: true,
      hasRestoreCheck: true,
    });

    expect(guide.summary).toMatch(/schema/);
    expect(guide.steps.join('\n')).toMatch(/prod:backup/);
    expect(guide.steps.join('\n')).toMatch(/prod:restore-check/);
    expect(guide.steps.join('\n')).toMatch(/git revert/);
  });

  it('na política só pelo provedor, orienta promover o deployment anterior', () => {
    const guide = buildRecoveryGuide({
      policy: 'provider-only-when-schema-compatible',
      hasBackupCommand: false,
      hasRestoreCheck: false,
    });

    expect(guide.steps.join('\n')).toMatch(/promova o deployment anterior/);
    expect(guide.steps.join('\n')).not.toMatch(/prod:restore-check/);
  });

  it('sem política no contrato, avisa e indica onde configurar', () => {
    const guide = buildRecoveryGuide({
      policy: undefined,
      hasBackupCommand: false,
      hasRestoreCheck: false,
    });

    expect(guide.summary).toMatch(/não define/);
    expect(guide.steps[0]).toMatch(/production\.json/);
  });
});
