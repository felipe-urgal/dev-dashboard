import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

const requestId = '00f65a70-6cd9-44b4-832a-8b1fd8b898d6';
const errorRequestId = '11f65a70-6cd9-44b4-832a-8b1fd8b898d6';

const logContent = [
  `[${requestId}] Started GET "/platform/fundacao" for 127.0.0.1 at 2026-07-28 15:59:31 -0300`,
  `[${requestId}] Processing by Platform::HomeController#index as HTML`,
  `[${requestId}]   Parameters: {"site"=>"fundacao"}`,
  `[${requestId}]   \u001b[1m\u001b[36mUser Load (0.3ms)\u001b[0m  \u001b[1m\u001b[34mSELECT users.* FROM users WHERE users.id = 2 LIMIT 1\u001b[0m`,
  `[${requestId}]   ↳ app/controllers/platform_controller.rb:18:in \`current_site'`,
  `[${requestId}]   \u001b[1m\u001b[36mBasePost Count (0.6ms)\u001b[0m  \u001b[1m\u001b[34mSELECT COUNT(*) FROM base_posts WHERE deleted_at IS NULL\u001b[0m`,
  `[${requestId}]   Rendering platform/home/index.html.haml within layouts/platform`,
  `[${requestId}]   Rendered platform/home/index.html.haml (Duration: 10.0ms | GC: 0.3ms)`,
  `[${requestId}] Completed 200 OK in 47ms (Views: 42.4ms | ActiveRecord: 1.6ms (4 queries, 0 cached) | GC: 1.9ms)`,
  `[${errorRequestId}] Started POST "/platform/posts" for 127.0.0.1 at 2026-07-28 16:01:02 -0300`,
  `[${errorRequestId}] Processing by Platform::PostsController#create as TURBO_STREAM`,
  `[${errorRequestId}]   Parameters: {"title"=>"Novo conteúdo"}`,
  `[${errorRequestId}] ActiveRecord::RecordInvalid (Validation failed: Title can't be blank)`,
  `[${errorRequestId}] Completed 422 Unprocessable Content in 612ms (Views: 4.2ms | ActiveRecord: 588.5ms (12 queries, 2 cached) | GC: 4.0ms)`,
].join('\n');

test('captura o visualizador estruturado de logs Rails', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem('dev-dashboard:theme', 'light');
  });

  await page.route('**/api/projects/*/process', async (route) => {
    const projectId = new URL(route.request().url()).pathname.split('/')[3] ?? 'visual-project';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        process: {
          id: 'visual-process',
          projectId,
          kind: 'server',
          status: 'running',
          pid: 193590,
          port: 3003,
          url: 'http://localhost:3003',
          startedAt: '2026-07-28T18:24:00.000Z',
        },
      }),
    });
  });

  await page.route('**/api/projects/*/process/logs?*', async (route) => {
    const projectId = new URL(route.request().url()).pathname.split('/')[3] ?? 'visual-project';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        log: {
          projectId,
          processId: 'visual-process',
          content: logContent,
          sizeBytes: logContent.length,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-07-28T19:59:31.000Z',
        },
      }),
    });
  });

  await gotoBootstrapped(page, '/');
  const projectHeading = page.getByRole('heading', {
    level: 3,
    name: 'sample-node-app',
  });
  await expect(projectHeading).toBeVisible();
  await projectHeading.locator('xpath=ancestor::a[1]').click();
  await page.getByRole('link', { name: 'Logs', exact: true }).click();
  await page.getByRole('button', { name: 'Requisições' }).click();
  await expect(page.getByText('/platform/fundacao', { exact: true })).toBeVisible();
  await expect(page.getByText('/platform/posts', { exact: true })).toBeVisible();

  await page.screenshot({
    path: 'e2e/.runtime/rails-log-viewer.png',
    fullPage: true,
  });
});
