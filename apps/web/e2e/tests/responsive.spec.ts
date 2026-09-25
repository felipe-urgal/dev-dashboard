import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dev-dashboard:primary-sidebar-collapsed';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'estreito', width: 375, height: 700 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

for (const viewport of VIEWPORTS) {
  test.describe(`largura ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('não produz overflow horizontal e mantém a navegação acessível', async ({
      page,
    }) => {
      if (viewport.name === 'tablet') {
        await page.addInitScript(
          ({ storageKey }) => {
            localStorage.setItem(storageKey, 'true');
          },
          { storageKey: SIDEBAR_COLLAPSED_STORAGE_KEY },
        );
      }

      await gotoBootstrapped(page, '/');
      await expect(
        page.getByRole('combobox', { name: 'Trocar workspace ativo' }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();

      await page.getByRole('link', { name: 'Processos' }).click();

      await expect(page.getByRole('link', { name: 'Processos' })).toHaveClass(
        /navigation-item-active/,
      );
      await expectNoHorizontalOverflow(page);

      await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible();
    });
  });
}

test.describe('sidebar do projeto em desktop baixo', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('mostra tooltips somente quando a sidebar está recolhida', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ storageKey }) => {
        localStorage.setItem(storageKey, 'true');
      },
      { storageKey: SIDEBAR_COLLAPSED_STORAGE_KEY },
    );

    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();

    const sidebarLinks = page.locator(
      '.project-details-tabs .project-details-tab',
    );
    const collapsedTooltips = await sidebarLinks.evaluateAll((links) =>
      links.map((link) => ({
        label: link.getAttribute('aria-label'),
        title: link.getAttribute('title'),
      })),
    );

    expect(collapsedTooltips.length).toBeGreaterThan(0);
    for (const item of collapsedTooltips) {
      expect(item.label).toBeTruthy();
      expect(item.title).toBe(item.label);
    }

    await page
      .getByRole('button', { name: 'Expandir sidebar do projeto' })
      .click();

    const expandedTitles = await sidebarLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('title')),
    );
    expect(expandedTitles.every((title) => title === null)).toBe(true);
  });

  test('mantém todos os atalhos visíveis sem rolagem vertical', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();

    const sidebar = page.locator('.project-details-tabs');
    await expect(
      page.getByRole('link', { name: 'Servidor', exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole('link', { name: 'README', exact: true }),
    ).toBeInViewport();

    const metrics = await sidebar.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      bottom: element.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }));

    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight);
    expect(Math.round(metrics.bottom)).toBe(metrics.viewportHeight);
  });
});
