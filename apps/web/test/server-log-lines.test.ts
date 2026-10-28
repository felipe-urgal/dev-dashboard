import { describe, expect, it } from 'vitest';

import {
  classifyServerLogLine,
  parseServerLog,
} from '../src/utils/server-log-lines';

describe('parseServerLog', () => {
  it('classifica erros, avisos, requisições, SQL e inicialização', () => {
    expect(classifyServerLogLine('=> Booting Puma')).toBe('boot');
    expect(classifyServerLogLine('Started GET "/" for 127.0.0.1')).toBe('req');
    expect(
      classifyServerLogLine('Completed 500 Internal Server Error in 3ms'),
    ).toBe('err');
    expect(
      classifyServerLogLine(
        '  User Load (0.4ms)  SELECT "users".* FROM "users"',
      ),
    ).toBe('sql');
    expect(classifyServerLogLine('DEPRECATION WARNING: foo')).toBe('warn');
    expect(
      classifyServerLogLine('Address already in use (Errno::EADDRINUSE)'),
    ).toBe('err');
    expect(classifyServerLogLine('qualquer outra coisa')).toBe('info');
  });

  it('remove ANSI, numera as linhas e ignora a quebra final', () => {
    const lines = parseServerLog('\u001b[32mStarted GET "/"\u001b[0m\nok\n');

    expect(lines.map((line) => [line.n, line.text])).toEqual([
      [1, 'Started GET "/"'],
      [2, 'ok'],
    ]);
  });

  it('devolve lista vazia para log vazio', () => {
    expect(parseServerLog('')).toEqual([]);
  });
});
