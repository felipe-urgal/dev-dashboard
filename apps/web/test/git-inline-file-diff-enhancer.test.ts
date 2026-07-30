import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { scanDetails } from '../src/git-inline-file-diff-enhancer';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

const RAW_PATCH = [
  'diff --git a/app/models/big_number.rb b/app/models/big_number.rb',
  'index 1111111..2222222 100644',
  '--- a/app/models/big_number.rb',
  '+++ b/app/models/big_number.rb',
  '@@ -32,6 +32,10 @@ class BigNumber',
  '     validates :big_number,',
  '       presence: true',
  ' ',
  '+    # Scope',
  '+',
  '     def title',
].join('\n');

function buildHistoryDetail(filePath = 'app/models/big_number.rb'): {
  host: HTMLElement;
  files: HTMLElement;
  patch: HTMLElement;
} {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="git-history-page-detail">
      <section class="git-history-page-detail-files">
        <header><h4>Arquivos alterados</h4></header>
        <ul><li><code>${filePath}</code></li></ul>
      </section>
      <details class="git-history-page-diff">
        <summary><span>Ver diff completo</span></summary>
        <pre></pre>
      </details>
    </div>
  `;
  document.body.append(host);
  const patch = host.querySelector<HTMLElement>('.git-history-page-diff pre')!;
  // Espelha patchView() (git-history-page-enhancer.ts): o texto bruto fica em
  // data-raw-patch, e o conteúdo visual (textContent/innerHTML) começa igual, mas pode
  // ser reescrito depois por outros enhancers sem afetar o atributo.
  patch.dataset.rawPatch = RAW_PATCH;
  patch.textContent = RAW_PATCH;
  const files = host.querySelector<HTMLElement>('.git-history-page-detail-files')!;
  return { host, files, patch };
}

test('mostra o diff do arquivo mesmo depois que outro enhancer remove os cabeçalhos do patch bruto', () => {
  const { host, files, patch } = buildHistoryDetail();
  cleanup = () => host.remove();

  scanDetails(host);

  // Simula a limpeza de cabeçalhos redundantes (git-diff-header-cleanup.ts) reescrevendo
  // o innerHTML visível do <pre> sem as linhas "diff --git"/"index"/"---"/"+++", como
  // acontece de verdade quando o destaque de sintaxe marca essas linhas como "is-meta" e
  // o cleanup as remove do DOM. O atributo data-raw-patch não é tocado por esse processo.
  patch.textContent = RAW_PATCH
    .split('\n')
    .filter((line) => !/^(diff --git |index |--- |\+\+\+ )/.test(line))
    .join('\n');

  const row = files.querySelector<HTMLElement>('li')!;
  row.click();

  const viewer = host.querySelector('.git-inline-file-diff');
  assert.ok(viewer);
  assert.doesNotMatch(viewer!.textContent ?? '', /não está disponível/);
  assert.match(viewer!.textContent ?? '', /Scope/);
});

test('mostra "patch indisponível" quando o arquivo realmente não está no patch', () => {
  const { host, files } = buildHistoryDetail('app/models/unrelated.rb');
  cleanup = () => host.remove();

  scanDetails(host);

  const row = files.querySelector<HTMLElement>('li')!;
  row.click();

  const viewer = host.querySelector('.git-inline-file-diff');
  assert.match(viewer!.textContent ?? '', /não está disponível/);
});

test('recorre ao textContent quando data-raw-patch não está presente', () => {
  const { host, files, patch } = buildHistoryDetail();
  delete patch.dataset.rawPatch;
  cleanup = () => host.remove();

  scanDetails(host);

  const row = files.querySelector<HTMLElement>('li')!;
  row.click();

  const viewer = host.querySelector('.git-inline-file-diff');
  assert.doesNotMatch(viewer!.textContent ?? '', /não está disponível/);
  assert.match(viewer!.textContent ?? '', /Scope/);
});
