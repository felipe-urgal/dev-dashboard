import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import {
  exportLogSnapshot,
  prepareLogExport,
  safeLogFilenameSegment,
} from '../src/utils/log-export';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('Falha ao ler o Blob.')),
    );
    reader.readAsText(blob);
  });
}

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

test('normaliza nomes sem permitir separadores de caminho', () => {
  assert.equal(
    safeLogFilenameSegment('../Meu Projeto/produção\\api'),
    'Meu-Projeto-producao-api',
  );
  assert.equal(safeLogFilenameSegment('..'), 'log');
});

test('monta cabeçalho com truncamento e mascaramento preservando o snapshot', () => {
  const prepared = prepareLogExport({
    projectName: 'API\nprincipal',
    origin: 'testes',
    identifier: '../execução/42',
    capturedAt: '2026-08-04T21:00:00.000Z',
    snapshot: {
      content: 'token=[CONTEUDO_MASCARADO]\nresultado final',
      truncated: true,
      masked: true,
      redactionCount: 1,
    },
  });

  assert.ok(prepared);
  assert.match(
    prepared.filename,
    /^dev-dashboard-API-principal-testes-execucao-42-/,
  );
  assert.doesNotMatch(prepared.filename, /[\\/]/);
  assert.match(prepared.content, /Projeto: API principal/);
  assert.match(prepared.content, /Origem: Testes/);
  assert.match(prepared.content, /Trecho truncado: Sim/);
  assert.match(
    prepared.content,
    /Conteúdo mascarado: Sim \(1 substituição\(ões\)\)/,
  );
  assert.match(prepared.content, /token=\[CONTEUDO_MASCARADO\]/);
  assert.doesNotMatch(prepared.content, /segredo-original/);
});

test('recusa snapshot vazio', () => {
  assert.equal(
    prepareLogExport({
      projectName: 'Projeto',
      origin: 'servidor',
      snapshot: {
        content: '  \n',
        truncated: false,
        masked: false,
        redactionCount: 0,
      },
    }),
    null,
  );
});

test('cria Blob, dispara o download e revoga o ObjectURL', async () => {
  let exportedBlob: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    exportedBlob = blob;
    return 'blob:dev-dashboard-log';
  });
  URL.revokeObjectURL = vi.fn();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);

  const exported = exportLogSnapshot({
    projectName: 'Projeto',
    origin: 'script',
    identifier: 'exec-1',
    capturedAt: '2026-08-04T21:00:00.000Z',
    snapshot: {
      content: 'saída segura',
      truncated: false,
      masked: false,
      redactionCount: 0,
    },
  });

  assert.equal(exported, true);
  assert.equal(click.mock.calls.length, 1);
  assert.deepEqual(vi.mocked(URL.revokeObjectURL).mock.calls, [
    ['blob:dev-dashboard-log'],
  ]);
  assert.ok(exportedBlob);
  assert.match(await readBlobText(exportedBlob), /saída segura/);
  assert.equal(document.querySelector('a[download]'), null);
});
