import { describe, expect, it } from 'vitest';

import { parseRubyInspect } from '../src/utils/ruby-inspect-parser';

describe('ruby-inspect-parser', () => {
  it('faz o parse de um hash simples com aspas duplas', () => {
    expect(
      parseRubyInspect('{"sort_column"=>"", "site"=>"observatorio"}'),
    ).toEqual({
      sort_column: '',
      site: 'observatorio',
    });
  });

  it('faz o parse de valores aninhados, arrays, números e booleanos', () => {
    expect(
      parseRubyInspect(
        '{"options"=>{"notify"=>true, "retries"=>0, "webhook_url"=>nil}, "ids"=>[1, 2, 3]}',
      ),
    ).toEqual({
      options: { notify: true, retries: 0, webhook_url: null },
      ids: [1, 2, 3],
    });
  });

  it('desembrulha #<ActionController::Parameters ... permitted: true>', () => {
    expect(
      parseRubyInspect(
        '#<ActionController::Parameters {"id"=>"847"} permitted: true>',
      ),
    ).toEqual({ id: '847' });
  });

  it('retorna undefined para entrada que não é um hash Ruby válido', () => {
    expect(parseRubyInspect('não é um hash')).toBeUndefined();
    expect(parseRubyInspect('')).toBeUndefined();
  });
});
