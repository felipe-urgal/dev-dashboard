import type { Page } from '@playwright/test';

import { readRuntimeInfo } from './runtime-info';

export async function gotoBootstrapped(page: Page, path = ''): Promise<void> {
  const info = await readRuntimeInfo();
  await page.goto(`${path}#bootstrap=${info.bootstrapToken}`);
}
