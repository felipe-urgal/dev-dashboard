import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { scanDetails } from '../src/git-inline-file-diff-enhancer';
import {
  splitView,
  unifiedView,
} from '../src/git-inline-file-diff/diff-render';

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
    <div class="git-summary-commit-detail">
      <section class="git-summary-detail-files">
        <header><h4>Arquivos alterados</h4></header>
        <ul><li><code>${filePath}</code></li></ul>
      </section>
      <div class="git-summary-detail-diff" hidden>
        <pre></pre>
      </div>
    </div>
  `;
  document.body.append(host);
  const patch = host.querySelector<HTMLElement>(
    '.git-summary-detail-diff pre',
  )!;
  // Espelha patchView() (git-history-page-enhancer.ts): o texto bruto fica em
  // data-raw-patch, e o conteúdo visual (textContent/innerHTML) começa igual, mas pode
  // ser reescrito depois por outros enhancers sem afetar o atributo.
  patch.dataset.rawPatch = RAW_PATCH;
  patch.textContent = RAW_PATCH;
  const files = host.querySelector<HTMLElement>('.git-summary-detail-files')!;
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
  patch.textContent = RAW_PATCH.split('\n')
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

test('mantém o patch combinado oculto apenas como fonte dos diffs individuais', () => {
  const { host, patch } = buildHistoryDetail();
  cleanup = () => host.remove();

  scanDetails(host);

  assert.equal(patch.isConnected, true);
  assert.ok(host.querySelector('.git-summary-detail-diff[hidden]'));
  assert.equal(host.querySelector('.git-inline-full-diff'), null);

  const row = host.querySelector<HTMLElement>('.git-summary-detail-files li')!;
  row.click();
  assert.match(
    host.querySelector('.git-inline-file-diff')?.textContent ?? '',
    /Scope/,
  );
});

test('mantém o cabeçalho do hunk como uma única linha nos dois modos do histórico', () => {
  const patch = ['@@ -14,6 +14,1 @@', '-antes', '+depois'].join('\n');

  const unified = unifiedView(patch);
  const unifiedHunk = unified.querySelector(
    '.git-inline-diff-line.is-hunk code',
  );
  assert.equal(unifiedHunk?.textContent, '@@ -14,6 +14,1 @@');
  assert.equal(
    unified.querySelectorAll('.git-inline-diff-line.is-hunk').length,
    1,
  );

  const split = splitView(patch);
  const splitHunk = split.querySelector(
    '.git-inline-diff-split-meta.is-hunk code',
  );
  assert.equal(splitHunk?.textContent, '@@ -14,6 +14,1 @@');
  assert.equal(
    split.querySelectorAll('.git-inline-diff-split-meta.is-hunk').length,
    1,
  );
});
