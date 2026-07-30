import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LOG_MASK,
  maskSensitiveLogContent,
} from '../src/log-protection.js';

test('mascara atribuições, bearer, URL e tokens conhecidos', () => {
  const result = maskSensitiveLogContent([
    'PASSWORD=segredo',
    'Authorization: Bearer abc.def.ghi',
    'postgres://usuario:senha@localhost/app',
    'token: "valor-super-secreto"',
    'ghp_abcdefghijklmnopqrstuvwxyz123456',
  ].join('\n'));

  assert.equal(result.masked, true);
  assert.equal(result.redactionCount, 5);
  assert.equal(result.content.includes('segredo'), false);
  assert.equal(result.content.includes('senha@'), false);
  assert.equal(result.content.includes('abc.def.ghi'), false);
  assert.equal(result.content.includes(LOG_MASK), true);
});

test('preserva termos sem contexto sensível e valores parecidos', () => {
  const input = [
    'tokenização concluída',
    'password policy enabled',
    'http://localhost:3000',
    'sk-curto',
    'mytoken=valor-publico',
  ].join('\n');
  const result = maskSensitiveLogContent(input);

  assert.deepEqual(result, {
    content: input,
    masked: false,
    redactionCount: 0,
  });
});

test('mascara segmentos sensíveis em nomes compostos de variáveis', () => {
  const result = maskSensitiveLogContent([
    'DATABASE_PASSWORD=segredo-do-banco',
    'JWT_SECRET=segredo-do-jwt',
    'NPM_TOKEN=segredo-do-npm',
    'SERVICE-ACCESS-TOKEN=segredo-do-servico',
    '{"APP_DATABASE_PASSWORD":"segredo-em-json"}',
  ].join('\n'));

  assert.equal(result.masked, true);
  assert.equal(result.redactionCount, 5);
  assert.equal(result.content, [
    `DATABASE_PASSWORD=${LOG_MASK}`,
    `JWT_SECRET=${LOG_MASK}`,
    `NPM_TOKEN=${LOG_MASK}`,
    `SERVICE-ACCESS-TOKEN=${LOG_MASK}`,
    `{"APP_DATABASE_PASSWORD":"${LOG_MASK}"}`,
  ].join('\n'));
});

test('é idempotente ao receber conteúdo já mascarado', () => {
  const first = maskSensitiveLogContent([
    'token=valor',
    'Authorization: Bearer outro-valor',
  ].join('\n'));
  const second = maskSensitiveLogContent(first.content);

  assert.equal(second.content, first.content);
  assert.equal(second.masked, false);
  assert.equal(second.redactionCount, 0);
});

test('mascara por inteiro valores entre aspas e propriedades JSON', () => {
  const result = maskSensitiveLogContent([
    'token="valor com espaços" restante',
    '{"password":"segredo com espaços"}',
    "client_secret='valor com \\' escape'",
  ].join('\n'));

  assert.equal(result.redactionCount, 3);
  assert.equal(result.content.includes('valor com'), false);
  assert.equal(result.content.includes('segredo com'), false);
  assert.match(result.content, /restante$/m);
  assert.match(result.content, /{"password":"\[CONTEUDO_MASCARADO\]"}/);
});

test('não trava com uma linha adversária de ~256KB sem quebras de linha', () => {
  // Uma única linha longa sem \n (ex. o progresso do rspec/vitest em uma
  // execução com muitos exemplos) fazia as regexes de SENSITIVE_ASSIGNMENT e
  // CREDENTIAL_URL retroceder de forma quadrática antes desta correção,
  // travando o event loop da API por dezenas de segundos ao ler o log.
  const adversarial = 'aaaa-'.repeat(52_000);

  const start = Date.now();
  const result = maskSensitiveLogContent(adversarial);
  const elapsed = Date.now() - start;

  assert.equal(result.masked, false);
  assert.ok(elapsed < 1_000, `esperado <1000ms, levou ${elapsed}ms`);
});
