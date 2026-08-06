import { spawn } from 'node:child_process';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import {
  OLLAMA_DOUBLE_ASSISTANT_REPLY,
  OLLAMA_DOUBLE_FOLLOW_UP_REPLY,
  OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER,
  OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER,
  OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER,
} from '../fixtures/ollama-double';
import { readRuntimeInfo } from '../fixtures/runtime-info';

// sample-node-app é um repositório Git real compartilhado por todo o e2e
// (ver server-harness.ts); a edição aplicada abaixo grava package.json no
// disco de verdade. Sem este checkout, a árvore de trabalho fica suja e
// quebra a suposição de "branch limpa" dos e2e de Git que rodam depois
// (project-git-branches.spec.ts / project-git-commit.spec.ts).
async function restoreSampleNodeAppWorkingTree(): Promise<void> {
  const info = await readRuntimeInfo();
  const projectDirectory = path.join(
    info.workspaceDirectory,
    'sample-node-app',
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['checkout', '--', 'package.json'], {
      cwd: projectDirectory,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git checkout saiu com código ${code}`));
    });
  });
}

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

    await restoreSampleNodeAppWorkingTree();
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
