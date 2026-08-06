import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { installEmbeddedEditorLayout } from '../src/embedded-editor-layout';

afterEach(() => {
  document.body.className = '';
  document.body.innerHTML = '';
  window.localStorage.clear();
  vi.restoreAllMocks();
});

test('expande editor, redimensiona explorer e encadeia o scroll para a página', () => {
  document.body.innerHTML = `
    <section class="embedded-ide">
      <header class="embedded-ide-header">
        <div class="embedded-ide-header-actions"></div>
      </header>
      <div class="embedded-ide-shell">
        <aside class="embedded-ide-sidebar"></aside>
        <div class="embedded-ide-workbench">
          <div class="embedded-ide-editor-area">
            <div class="monaco-scrollable-element"><span>conteúdo</span></div>
          </div>
        </div>
      </div>
    </section>
  `;

  const sidebar = document.querySelector<HTMLElement>('.embedded-ide-sidebar');
  assert.ok(sidebar);
  Object.defineProperty(sidebar, 'getBoundingClientRect', {
    value: () => ({ width: 280 }),
  });

  installEmbeddedEditorLayout();

  const section = document.querySelector<HTMLElement>('.embedded-ide');
  const fullscreen = document.querySelector<HTMLButtonElement>(
    '[data-editor-fullscreen-button]',
  );
  const separator = document.querySelector<HTMLElement>(
    '[data-editor-resize-separator]',
  );
  assert.ok(section);
  assert.ok(fullscreen);
  assert.ok(separator);
  assert.equal(separator.getAttribute('aria-valuenow'), '280');

  separator.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }),
  );
  assert.equal(separator.getAttribute('aria-valuenow'), '296');
  assert.equal(
    section.style.getPropertyValue('--embedded-editor-sidebar-width'),
    '296px',
  );

  fullscreen.click();
  assert.ok(section.classList.contains('embedded-ide-fullscreen'));
  assert.ok(document.body.classList.contains('embedded-ide-fullscreen-open'));
  assert.equal(fullscreen.getAttribute('aria-pressed'), 'true');

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(!section.classList.contains('embedded-ide-fullscreen'));
  assert.ok(!document.body.classList.contains('embedded-ide-fullscreen-open'));

  const scrollable = document.querySelector<HTMLElement>(
    '.monaco-scrollable-element',
  );
  assert.ok(scrollable);
  Object.defineProperties(scrollable, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
    scrollTop: { value: 100, writable: true },
  });

  const scrollPage = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});

  scrollable.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    }),
  );
  assert.equal(scrollPage.mock.calls.length, 0);

  scrollable.scrollTop = 0;
  scrollable.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -80,
    }),
  );
  assert.deepEqual(scrollPage.mock.calls[0], [
    {
      top: -80,
      left: 0,
      behavior: 'auto',
    },
  ]);

  scrollable.scrollTop = 800;
  scrollable.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    }),
  );
  assert.deepEqual(scrollPage.mock.calls[1], [
    {
      top: 120,
      left: 0,
      behavior: 'auto',
    },
  ]);
});
