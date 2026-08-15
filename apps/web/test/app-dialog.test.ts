import assert from 'node:assert/strict';
import { test } from 'vitest';

import { alertDialog, confirmDialog } from '../src/stores/app-dialog';

// Em ambiente de teste, alertDialog/confirmDialog resolvem imediatamente sem
// renderizar o diálogo real da Naive UI (evita testes pendurados esperando
// um clique que ninguém vai simular). O comportamento interativo do diálogo
// em si é responsabilidade da biblioteca, não deste código.

test('confirmDialog resolve como confirmado em ambiente de teste', async () => {
  const result = await confirmDialog({
    title: 'Remover item?',
    message: 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    tone: 'danger',
  });

  assert.equal(result, true);
});

test('confirmDialog aceita uma mensagem simples em vez de opções', async () => {
  const result = await confirmDialog('Confirma?');
  assert.equal(result, true);
});

test('alertDialog resolve em ambiente de teste', async () => {
  await assert.doesNotReject(
    alertDialog({
      title: 'Operação concluída',
      message: 'As alterações foram salvas.',
    }),
  );
});

test('alertDialog aceita uma mensagem simples em vez de opções', async () => {
  await assert.doesNotReject(alertDialog('Feito.'));
});
