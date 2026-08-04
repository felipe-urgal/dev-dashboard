import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { OLLAMA_DOUBLE_ASSISTANT_REPLY } from '../fixtures/ollama-double';

test.describe('assistente de IA (Ollama local)', () => {
  test('painel de chat detecta o modelo e conversa até a conclusão', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await page.getByRole('link', { name: 'Ver detalhes de sample-node-app' }).click();
    await page.getByRole('link', { name: 'Editor' }).click();

    await page.getByRole('treeitem', { name: /package\.json/ }).click();
    await page.getByRole('button', { name: 'IA', exact: true }).click();

    const modelSelect = page.getByLabel('Modelo de IA');
    await expect(modelSelect).toHaveValue('e2e-mock-model');

    const input = page.getByLabel('Mensagem para o assistente de IA');
    await input.fill('Explique o arquivo package.json.');
    await page.getByRole('button', { name: 'Enviar' }).click();

    const transcript = page.getByRole('log', { name: 'Conversa com o assistente de IA' });
    await expect(transcript).toContainText(OLLAMA_DOUBLE_ASSISTANT_REPLY);
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  });
});
