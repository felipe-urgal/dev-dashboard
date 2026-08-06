import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import {
  OLLAMA_DOUBLE_ASSISTANT_REPLY,
  OLLAMA_DOUBLE_FOLLOW_UP_REPLY,
  OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER,
  OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER,
  OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER,
} from '../fixtures/ollama-double';

async function openAiPanelOnPackageJson(page: import('@playwright/test').Page) {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();
  await page.getByRole('link', { name: 'Editor' }).click();

  await page.getByRole('treeitem', { name: /package\.json/ }).click();
  await page.getByRole('button', { name: 'IA', exact: true }).click();

  const modelSelect = page.getByLabel('Modelo de IA');
  await expect(modelSelect).toHaveValue('e2e-mock-model');
}

async function sendMessage(
  page: import('@playwright/test').Page,
  message: string,
) {
  const input = page.getByLabel('Mensagem para o assistente de IA');
  await input.fill(message);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test.describe('assistente de IA (Ollama local)', () => {
  test('painel de chat detecta o modelo e conversa até a conclusão', async ({
    page,
  }) => {
    await openAiPanelOnPackageJson(page);
    await sendMessage(page, 'Explique o arquivo package.json.');

    const transcript = page.getByRole('log', {
      name: 'Conversa com o assistente de IA',
    });
    await expect(transcript).toContainText(OLLAMA_DOUBLE_ASSISTANT_REPLY);
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  });

  test('propose_workspace_edit: modelo propõe edição, usuário revisa e confirma', async ({
    page,
  }) => {
    await openAiPanelOnPackageJson(page);
    await sendMessage(
      page,
      `Corrija o nome do pacote. ${OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER}`,
    );

    const transcript = page.getByRole('log', {
      name: 'Conversa com o assistente de IA',
    });
    await expect(transcript).toContainText(OLLAMA_DOUBLE_FOLLOW_UP_REPLY);
    await expect(page.getByText(/Edição proposta/)).toBeVisible();

    const review = page.getByRole('heading', {
      name: 'Alteração proposta pelo servidor de linguagem',
    });
    await expect(review).toBeVisible();
    await expect(page.getByText('sample-node-app-v2')).toBeVisible();

    await page.getByRole('button', { name: 'Aplicar alterações' }).click();

    await expect(review).toBeHidden();
    await expect(
      page.getByText('1 arquivo atualizado pelo fluxo seguro.'),
    ).toBeVisible();
  });

  test('get_symbol_definition: ferramenta é executada e o resultado aparece na conversa', async ({
    page,
  }) => {
    await openAiPanelOnPackageJson(page);
    await sendMessage(
      page,
      `Onde isso é definido? ${OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER}`,
    );

    const transcript = page.getByRole('log', {
      name: 'Conversa com o assistente de IA',
    });
    await expect(transcript).toContainText(OLLAMA_DOUBLE_FOLLOW_UP_REPLY);
    await expect(page.getByText(/Definição consultada/)).toBeVisible();
  });

  test('get_symbol_references: ferramenta é executada e o resultado aparece na conversa', async ({
    page,
  }) => {
    await openAiPanelOnPackageJson(page);
    await sendMessage(
      page,
      `Onde isso é usado? ${OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER}`,
    );

    const transcript = page.getByRole('log', {
      name: 'Conversa com o assistente de IA',
    });
    await expect(transcript).toContainText(OLLAMA_DOUBLE_FOLLOW_UP_REPLY);
    await expect(page.getByText(/Referências consultadas/)).toBeVisible();
  });
});
