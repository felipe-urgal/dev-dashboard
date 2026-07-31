import { describe, expect, it } from 'vitest';

import type { RailsLogLine } from '../src/utils/rails-log-parser';
import {
  groupSqlLines,
  highlightSqlHtml,
} from '../src/utils/sql-highlight';

function sqlLine(text: string, id = 'line'): RailsLogLine {
  return { id, text, kind: 'sql' };
}

describe('highlightSqlHtml', () => {
  it('envolve palavras-chave, identificadores, strings e números em spans', () => {
    const html = highlightSqlHtml('SELECT * FROM `sites` WHERE `id` = ?');

    expect(html).toContain('<span class="sql-tk-kw">SELECT</span>');
    expect(html).toContain('<span class="sql-tk-kw">FROM</span>');
    expect(html).toContain('<span class="sql-tk-ident">`sites`</span>');
    expect(html).toContain('<span class="sql-tk-num">?</span>');
  });

  it('escapa HTML no texto não destacado', () => {
    expect(highlightSqlHtml("<script>alert('x')</script>")).not.toContain('<script>');
  });
});

describe('groupSqlLines', () => {
  it('agrupa consultas repetidas pelo padrão normalizado e marca N+1', () => {
    const lines: RailsLogLine[] = [
      sqlLine('Site Load (0.4ms)  SELECT `sites`.* FROM `sites` WHERE `id` = 1', '1'),
      sqlLine('Site Load (0.3ms)  SELECT `sites`.* FROM `sites` WHERE `id` = 2', '2'),
      sqlLine('Site Load (0.5ms)  SELECT `sites`.* FROM `sites` WHERE `id` = 3', '3'),
      sqlLine('User Load (1.0ms)  SELECT `users`.* FROM `users` LIMIT 1', '4'),
    ];

    const groups = groupSqlLines(lines);

    expect(groups).toHaveLength(2);
    const n1 = groups.find((group) => group.n1Suspect);
    expect(n1?.count).toBe(3);
    expect(n1?.pattern).toBe('SELECT `sites`.* FROM `sites` WHERE `id` = ?');
    expect(n1?.totalMs).toBeCloseTo(1.2);

    const single = groups.find((group) => !group.n1Suspect);
    expect(single?.count).toBe(1);
  });
});
