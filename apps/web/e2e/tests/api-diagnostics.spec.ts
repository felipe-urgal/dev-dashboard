import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('diagnóstico de chamadas da API', () => {
  test('exibe métricas, permite filtrar o histórico e exporta JSON', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/processes');

    const diagnostics = page.getByRole('region', {
      name: 'Diagnóstico de chamadas',
    });
    await expect(diagnostics).toBeVisible();
    await diagnostics.getByRole('button', { name: 'Ver métricas' }).click();

    await expect(
      diagnostics
        .locator('.api-request-diagnostics-summary span')
        .filter({ hasText: /^Chamadas$/ }),
    ).toBeVisible();
    const historyFilter = diagnostics.getByLabel('Histórico');
    await expect(historyFilter).toHaveValue('all');
    await expect(historyFilter.locator('option')).toHaveText([
      'Todos',
      'Atenção',
      'Críticos',
    ]);

    await historyFilter.selectOption('danger');
    await expect(historyFilter).toHaveValue('danger');
    await historyFilter.selectOption('warning');
    await expect(historyFilter).toHaveValue('warning');

    const downloadPromise = page.waitForEvent('download');
    await diagnostics.getByRole('button', { name: 'Exportar JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^api-diagnostics-.*\.json$/);
  });
});
