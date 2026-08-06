import { describe, expect, it } from 'vitest';

import {
  parseRailsLog,
  railsRequestStatusTone,
  stripAnsiSequences,
} from '../src/utils/rails-log-parser';

const requestId = '00f65a70-6cd9-44b4-832a-8b1fd8b898d6';

const railsLog = [
  `[${requestId}] Started GET "/platform/fundacao" for 127.0.0.1 at 2026-07-28 15:59:31 -0300`,
  `[${requestId}] Processing by Platform::HomeController#index as HTML`,
  `[${requestId}]   Parameters: {"site"=>"fundacao"}`,
  `[${requestId}]   \u001b[1m\u001b[36mUser Load (0.3ms)\u001b[0m  \u001b[1m\u001b[34mSELECT users.* FROM users LIMIT 1\u001b[0m`,
  `[${requestId}]   ↳ app/controllers/platform_controller.rb:18:in \`current_site'`,
  `[${requestId}]   Rendering platform/home/index.html.haml within layouts/platform`,
  `[${requestId}]   Rendered platform/home/index.html.haml (Duration: 10.0ms | GC: 0.3ms)`,
  `[${requestId}] Completed 200 OK in 47ms (Views: 42.4ms | ActiveRecord: 1.6ms (4 queries, 0 cached) | GC: 1.9ms)`,
].join('\n');

describe('rails-log-parser', () => {
  it('remove sequências ANSI sem apagar o conteúdo', () => {
    expect(stripAnsiSequences('\u001b[1m\u001b[36mUser Load\u001b[0m')).toBe(
      'User Load',
    );
  });

  it('agrupa uma requisição e extrai seus indicadores', () => {
    const parsed = parseRailsLog(railsLog);
    const group = parsed.groups[0];

    expect(group?.kind).toBe('request');
    if (!group || group.kind !== 'request') return;

    expect(group.method).toBe('GET');
    expect(group.path).toBe('/platform/fundacao');
    expect(group.controller).toBe('Platform::HomeController');
    expect(group.action).toBe('index');
    expect(group.status).toBe(200);
    expect(group.durationMs).toBe(47);
    expect(group.viewDurationMs).toBe(42.4);
    expect(group.activeRecordDurationMs).toBe(1.6);
    expect(group.queryCount).toBe(4);
    expect(group.cachedQueries).toBe(0);
    expect(group.gcDurationMs).toBe(1.9);
    expect(group.sqlLines).toHaveLength(1);
    expect(group.renderLines).toHaveLength(2);
    expect(group.sourceLines).toHaveLength(1);
    expect(group.lines.some((line) => line.text.includes('\u001b'))).toBe(
      false,
    );
  });

  it('resume os requests por faixa de status', () => {
    const failedRequestId = '11f65a70-6cd9-44b4-832a-8b1fd8b898d6';
    const parsed = parseRailsLog(
      [
        railsLog,
        `[${failedRequestId}] Completed 500 Internal Server Error in 12ms (ActiveRecord: 0.0ms (0 queries, 0 cached) | GC: 0.0ms)`,
      ].join('\n'),
    );

    expect(parsed.summary.totalRequests).toBe(2);
    expect(parsed.summary.successful).toBe(1);
    expect(parsed.summary.serverErrors).toBe(1);
    expect(parsed.summary.totalQueries).toBe(4);
  });

  it('não classifica como SQL uma linha que só menciona a palavra no meio do texto', () => {
    const parsed = parseRailsLog(
      `[${requestId}] No template found for Api::V1::UserSettingsController#UPDATE, rendering head :no_content`,
    );

    expect(parsed.groups[0]?.kind).toBe('request');
    if (parsed.groups[0]?.kind !== 'request') return;
    expect(parsed.groups[0].sqlLines).toHaveLength(0);
  });

  it('classifica a tonalidade do status HTTP', () => {
    expect(railsRequestStatusTone(200)).toBe('success');
    expect(railsRequestStatusTone(302)).toBe('redirect');
    expect(railsRequestStatusTone(404)).toBe('warning');
    expect(railsRequestStatusTone(500)).toBe('error');
    expect(railsRequestStatusTone(undefined)).toBe('neutral');
  });
});
