import { describe, expect, it } from 'vitest';

import {
  parseSidekiqLog,
  sidekiqRuntimeInfo,
} from '../src/utils/sidekiq-log-lines';
import {
  classifyWebpackLogLine,
  webpackRuntimeInfo,
} from '../src/utils/webpack-log-lines';

const T = '2026-10-28T15:41:12.512Z';

describe('parseSidekiqLog', () => {
  it('separa hora, nível e ruído técnico, e destaca a classe do job', () => {
    const [line] = parseSidekiqLog(
      `${T} pid=331839 tid=7a1b class=SyncJob jid=a1 elapsed=0.412 INFO: done`,
    );

    expect(line).toMatchObject({
      kind: 'job',
      time: '15:41:12.512',
      level: 'INFO',
      tech: 'pid=331839 tid=7a1b',
    });
    expect(line?.parts).toEqual([
      { text: 'done', tone: 'ok' },
      { text: ' SyncJob', tone: 'accent' },
      { text: '  jid=a1 elapsed=0.412', tone: 'dim' },
    ]);
  });

  it('classifica níveis, falha de job e linhas de inicialização', () => {
    const lines = parseSidekiqLog(
      [
        `${T} pid=1 tid=a WARN: Retrying in 15s`,
        `${T} pid=1 tid=a FATAL: Redis::CannotConnectError`,
        `${T} pid=1 tid=a class=Foo jid=b INFO: fail`,
        `${T} pid=1 tid=a INFO: Booted Rails 8.1 application`,
        'linha fora do formato',
      ].join('\n'),
    );

    expect(lines.map((line) => line.kind)).toEqual([
      'warn',
      'err',
      'err',
      'boot',
      'info',
    ]);
  });

  it('lê versão e Redis impressos na inicialização', () => {
    expect(
      sidekiqRuntimeInfo(
        'Sidekiq 7.3.10 connecting to Redis with options {:size=>10, :url=>"redis://localhost:6379/0"}',
      ),
    ).toEqual({ version: '7.3.10', redis: 'redis://localhost:6379/0' });
  });
});

describe('webpack', () => {
  it('classifica erro, aviso, compilação e inicialização', () => {
    expect(classifyWebpackLogLine('ERROR in ./a.js Module not found')).toBe(
      'err',
    );
    expect(classifyWebpackLogLine('WARNING in ./b.js')).toBe('warn');
    expect(classifyWebpackLogLine('✔ Compiled successfully in 3.4s')).toBe(
      'job',
    );
    expect(
      classifyWebpackLogLine('Project is running at http://localhost:3035/'),
    ).toBe('boot');
  });

  it('lê a porta e a versão do dev server', () => {
    expect(
      webpackRuntimeInfo(
        'webpack-dev-server 4.15.1 · Project is running at http://localhost:3035/',
      ),
    ).toEqual({ port: '3035', version: '4.15.1' });
  });
});
