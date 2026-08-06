import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Catálogo de scripts do projeto', () => {
  test('executa com sucesso, falha sob confirmação e reseta ao trocar de projeto', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Detalhes do projeto' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Scripts' }).click();

    const lintCard = page.locator('.script-card', {
      has: page.getByRole('heading', { level: 4, name: 'lint', exact: true }),
    });
    const formatCard = page.locator('.script-card', {
      has: page.getByRole('heading', { level: 4, name: 'format', exact: true }),
    });
    await expect(lintCard).toBeVisible();
    await expect(formatCard).toBeVisible();

    // "lint" é somente leitura: executa direto, sem confirmação. Iniciar a
    // execução muda automaticamente para a aba "Execuções".
    await lintCard.getByRole('button', { name: 'Executar' }).click();
    await expect(page.getByRole('tab', { name: 'Execuções' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByText('Em execução', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Concluída', { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // "format" é mutável: exige confirmação explícita antes de rodar, e falha.
    await page.getByRole('tab', { name: 'Catálogo' }).click();
    await formatCard.getByRole('button', { name: 'Executar' }).click();
    await expect(
      page.getByRole('button', { name: 'Executar ação' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Executar ação' }).click();
    await expect(
      page.getByText('Em execução', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Falhou', { exact: true }).first()).toBeVisible(
      { timeout: 10_000 },
    );

    // Troca de projeto: sample-rails-app só tem Gemfile (ações de Bundler,
    // delegadas à aba Dependências) e bin/sidekiq (fora do catálogo, tratado
    // pela aba Sidekiq/webpack) — catálogo vazio, sem resquício dos scripts
    // Node vistos acima.
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await page.getByRole('link', { name: 'Scripts' }).click();

    await expect(page.getByText('Nenhuma ação encontrada')).toBeVisible();
    await expect(page.locator('.script-card')).toHaveCount(0);
  });
});
