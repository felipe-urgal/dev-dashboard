import type { Page } from '@playwright/test';

import { readRuntimeInfo } from './runtime-info';

export async function gotoBootstrapped(page: Page, path = ''): Promise<void> {
  const info = await readRuntimeInfo();
  await page.goto(`${path}#bootstrap=${info.bootstrapToken}`);
}

/** Abre uma ferramenta pelo menu de áreas do projeto (dropdown da área). */
export async function openProjectTool(
  page: Page,
  area: string,
  tool: string,
): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Áreas do projeto' })
    .getByRole('button', { name: area })
    .click();
  await page
    .locator('.n-dropdown-menu')
    .getByText(tool, { exact: true })
    .click();
}
