import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

async function rootAttributes(page: Page) {
  return page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
  }));
}

test.describe('tema', () => {
  test('padrão é escuro', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect.poll(() => rootAttributes(page)).toEqual({ theme: 'dark' });
  });

  for (const [label, theme] of [
    ['Escuro', 'dark'],
    ['Claro', 'light'],
  ] as const) {
    test(`troca de tema para ${theme} aplica e persiste após recarregar`, async ({
      page,
    }) => {
      await gotoBootstrapped(page, '/');

      await page
        .getByRole('group', { name: 'Tema' })
        .getByRole('button', { name: label })
        .click();

      await expect.poll(() => rootAttributes(page)).toMatchObject({ theme });

      await page.reload();
      await expect.poll(() => rootAttributes(page)).toMatchObject({ theme });
    });
  }

  test('prefers-reduced-motion reduz animações e transições globais', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoBootstrapped(page, '/');

    const motion = await page
      .locator('.navigation-item')
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        const toMilliseconds = (value: string): number =>
          value.endsWith('ms')
            ? Number.parseFloat(value)
            : Number.parseFloat(value) * 1000;
        const reduced = (value: string): boolean =>
          value
            .split(',')
            .map((entry) => entry.trim())
            .every((entry) => toMilliseconds(entry) <= 0.01);

        return {
          animationReduced: reduced(style.animationDuration),
          transitionReduced: reduced(style.transitionDuration),
          scrollBehavior: style.scrollBehavior,
        };
      });

    expect(motion).toEqual({
      animationReduced: true,
      transitionReduced: true,
      scrollBehavior: 'auto',
    });
  });
});
