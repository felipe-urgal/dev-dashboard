import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Mutações de branch Git do projeto', () => {
  test('cria, troca e recusa nome duplicado; projeto sem Git fica vazio', async ({
    page,
  }) => {
    // Vazio: sample-rails-app não tem .git.
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await expect(
      page.getByText('Este projeto não é um repositório Git.'),
    ).toBeVisible();

    // sample-node-app é um repositório Git real (fixture com commit inicial em "main").
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await page.getByRole('button', { name: 'Branches' }).click();

    await expect(
      page.locator('.branch-table-row', {
        has: page.getByText('main', { exact: true }),
      }),
    ).toBeVisible();

    // Sucesso: cria "feature/e2e-branch" a partir de "main" e troca para ela.
    await page.getByRole('button', { name: 'Nova branch' }).click();
    await page.getByLabel('Nome', { exact: true }).fill('e2e-branch');
    await page.getByRole('button', { name: 'Criar e trocar' }).click();
    await expect(
      page.getByRole('button', { name: 'Criar branch' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Criar branch' }).click();
    await expect(
      page.getByText('Branch "feature/e2e-branch" criada e selecionada.'),
    ).toBeVisible();

    const newBranchRow = page.locator('.branch-table-row', {
      has: page.getByText('feature/e2e-branch', { exact: true }),
    });
    await expect(newBranchRow.locator('.branch-current-badge')).toBeVisible();

    // Erro: recriar o mesmo nome falha, sem trocar a branch atual.
    await page.getByRole('button', { name: 'Nova branch' }).click();
    await page.getByLabel('Nome', { exact: true }).fill('e2e-branch');
    await page.getByRole('button', { name: 'Criar e trocar' }).click();
    await page.getByRole('button', { name: 'Criar branch' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(newBranchRow.locator('.branch-current-badge')).toBeVisible();

    // Trocar de volta para "main" pela ação "Trocar" da própria linha.
    const mainRow = page.locator('.branch-table-row', {
      has: page.getByText('main', { exact: true }),
    });
    await mainRow.getByRole('button', { name: 'Trocar' }).click();
    await expect(
      page.getByRole('button', { name: 'Trocar de branch' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Trocar de branch' }).click();
    await expect(page.getByText('Agora na branch "main".')).toBeVisible();
    await expect(mainRow.locator('.branch-current-badge')).toBeVisible();

    // Publica a branch local e mantém o origin dentro do próprio fixture.
    await newBranchRow.getByRole('button', { name: 'Trocar' }).click();
    await page.getByRole('button', { name: 'Trocar de branch' }).click();
    await expect(newBranchRow.locator('.branch-current-badge')).toBeVisible();

    await newBranchRow.getByLabel('Mais ações para feature/e2e-branch').click();
    await newBranchRow.getByRole('button', { name: 'Publicar' }).click();
    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    await expect(
      page.getByText(
        'Branch "feature/e2e-branch" publicada em origin/feature/e2e-branch.',
      ),
    ).toBeVisible();

    // Renomear localmente preserva a associação com o origin antigo.
    await newBranchRow.getByLabel('Mais ações para feature/e2e-branch').click();
    await newBranchRow.getByRole('button', { name: 'Renomear' }).click();
    await page.getByLabel('Novo nome').fill('feature/e2e-renamed');
    await page.getByRole('button', { name: 'Salvar novo nome' }).click();
    await expect(
      page.getByText(
        'Branch "feature/e2e-branch" renomeada para "feature/e2e-renamed".',
      ),
    ).toBeVisible();

    const renamedRow = page.locator('.branch-table-row', {
      has: page.getByText('feature/e2e-renamed', { exact: true }),
    });
    await expect(
      renamedRow.getByText('acompanha origin/feature/e2e-branch'),
    ).toBeVisible();

    // Branch existente apenas no origin pode ser trazida para local.
    const remoteOnlyRow = page.locator('.branch-table-row', {
      has: page.getByText('feature/remota-e2e', { exact: true }),
    });
    await remoteOnlyRow.getByRole('button', { name: 'Trazer para local' }).click();
    await page.getByRole('button', { name: 'Criar e trocar' }).click();
    await expect(
      page.getByText(
        'Branch remota "origin/feature/remota-e2e" criada localmente como "feature/remota-e2e" e selecionada.',
      ),
    ).toBeVisible();

    // A branch trazida pode ser removida localmente após voltar para main.
    await mainRow.getByRole('button', { name: 'Trocar' }).click();
    await page.getByRole('button', { name: 'Trocar de branch' }).click();
    await expect(mainRow.locator('.branch-current-badge')).toBeVisible();

    const trackedRemoteRow = page.locator('.branch-table-row', {
      has: page.getByText('feature/remota-e2e', { exact: true }),
    });
    await trackedRemoteRow
      .getByLabel('Mais ações para feature/remota-e2e')
      .click();
    await trackedRemoteRow.getByRole('button', { name: 'Remover branch' }).click();
    await page.getByLabel('Nome da branch').fill('feature/remota-e2e');
    await page.getByRole('button', { name: 'Remover branch local' }).click();
    await expect(
      page.getByText('Branch "feature/remota-e2e" removida.'),
    ).toBeVisible();

    // Troca de projeto: sample-rails-app continua sem Git, sem resquício
    // de mensagens/branches do sample-node-app vistas acima.
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await expect(
      page.getByText('Este projeto não é um repositório Git.'),
    ).toBeVisible();
    await expect(page.locator('.branch-table-row')).toHaveCount(0);
  });
});
