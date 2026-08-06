import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import {
  enhanceTestLogAutoFollow,
  isTestLogNearEnd,
} from '../src/test-log-auto-follow';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test('considera o log no final usando uma margem confortável', () => {
  assert.equal(
    isTestLogNearEnd({ scrollTop: 340, scrollHeight: 500, clientHeight: 120 }),
    true,
  );
  assert.equal(
    isTestLogNearEnd({ scrollTop: 100, scrollHeight: 500, clientHeight: 120 }),
    false,
  );
});

test('acompanha novas linhas, mas respeita quando a pessoa rola para cima', async () => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });

  let scrollHeight = 300;
  const viewport = document.createElement('div');
  viewport.className = 'tests-log-output';
  Object.defineProperty(viewport, 'clientHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(viewport, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  viewport.scrollTop = 200;
  viewport.innerHTML = '<ol class="tests-log-lines"><li>linha 1</li></ol>';
  document.body.append(viewport);

  enhanceTestLogAutoFollow(document);
  assert.equal(viewport.scrollTop, 300);

  viewport.scrollTop = 20;
  viewport.dispatchEvent(new Event('scroll'));
  scrollHeight = 400;
  viewport.querySelector('ol')?.append(document.createElement('li'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(viewport.scrollTop, 20);

  viewport.scrollTop = 300;
  viewport.dispatchEvent(new Event('scroll'));
  scrollHeight = 500;
  viewport.querySelector('ol')?.append(document.createElement('li'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(viewport.scrollTop, 500);
});
