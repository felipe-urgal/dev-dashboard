import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DatabaseReadonlyError,
  DatabaseReadonlyService,
} from '../src/services/database-readonly-service.js';

test('lista bancos e tabelas sem expor a senha nos argumentos', async () => {
  const calls: Array<{
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  }> = [];
  const service = new DatabaseReadonlyService(async (command, args, env) => {
    calls.push({ command, args, env });
    return 'name\tother\napp\tpublic';
  });
  const connection = {
    driver: 'postgresql' as const,
    password: 'segredo',
    database: 'app',
  };
  assert.deepEqual(await service.listDatabases(connection), [{ name: 'app' }]);
  assert.equal(calls[0]?.command, 'psql');
  assert.equal(calls[0]?.args.includes('segredo'), false);
  assert.equal(calls[0]?.env.PGPASSWORD, 'segredo');
  assert.equal(calls[0]?.env.PGDATABASE, 'app');
  assert.match(
    calls[0]?.env.PGOPTIONS ?? '',
    /default_transaction_read_only=on/,
  );
  assert.match(calls[0]?.env.PGOPTIONS ?? '', /statement_timeout=15000/);
  assert.deepEqual(await service.listTables(connection), [
    { schema: 'app', name: 'public' },
  ]);
});

test('passa host, porta e usuário explicitamente para o cliente MySQL', async () => {
  let args: string[] | undefined;
  let environment: NodeJS.ProcessEnv | undefined;
  const service = new DatabaseReadonlyService(
    async (_command, commandArgs, env) => {
      args = commandArgs;
      environment = env;
      return 'name\tother\napp\tpublic';
    },
  );
  await service.listDatabases({
    driver: 'mysql',
    username: 'root',
    password: '123456',
  });
  assert.deepEqual(args?.slice(0, 9), [
    '--no-defaults',
    '--protocol=tcp',
    '--host',
    '127.0.0.1',
    '--port',
    '3306',
    '--user',
    'root',
    '--column-names',
  ]);
  assert.equal(args?.includes('123456'), false);
  assert.equal(
    args?.includes('--init-command=SET SESSION TRANSACTION READ ONLY'),
    true,
  );
  assert.equal(environment?.MYSQL_PWD, '123456');
});

test('aplica a sessão read-only também para MariaDB', async () => {
  let args: string[] = [];
  const service = new DatabaseReadonlyService(
    async (_command, commandArgs) => {
      args = commandArgs;
      return 'id\n1';
    },
  );

  await service.query({ driver: 'mariadb' }, 'SELECT 1');

  assert.equal(
    args.includes('--init-command=SET SESSION TRANSACTION READ ONLY'),
    true,
  );
});

test('usa o banco postgres quando o PostgreSQL não recebe um banco padrão', async () => {
  let environment: NodeJS.ProcessEnv | undefined;
  const service = new DatabaseReadonlyService(async (_command, _args, env) => {
    environment = env;
    return 'name\npostgres';
  });
  await service.listDatabases({ driver: 'postgresql', username: 'felipe' });
  assert.equal(environment?.PGDATABASE, 'postgres');
  assert.match(
    environment?.PGOPTIONS ?? '',
    /default_transaction_read_only=on/,
  );
});

test('bloqueia consultas de escrita, múltiplas instruções e hosts remotos', async () => {
  const service = new DatabaseReadonlyService(async () => 'id\n1');
  await assert.rejects(
    () => service.query({ driver: 'mysql' }, "UPDATE users SET name = 'x'"),
    (error: unknown) =>
      error instanceof DatabaseReadonlyError &&
      error.reason === 'invalid-query',
  );
  await assert.rejects(
    () => service.query({ driver: 'mysql' }, 'SELECT 1; SELECT 2'),
    /Somente/,
  );
  await assert.rejects(
    () => service.listDatabases({ driver: 'postgresql', host: 'db.example' }),
    /apenas bancos locais/,
  );
});

test('bloqueia SELECTs com efeitos colaterais conhecidos por driver', async () => {
  let calls = 0;
  const service = new DatabaseReadonlyService(async () => {
    calls += 1;
    return 'id\n1';
  });

  const cases = [
    {
      driver: 'mysql' as const,
      query: "SELECT id FROM users INTO OUTFILE '/tmp/users.csv'",
    },
    {
      driver: 'mariadb' as const,
      query: "SELECT LOAD_FILE('/etc/passwd')",
    },
    {
      driver: 'postgresql' as const,
      query: 'SELECT * INTO users_copy FROM users',
    },
    {
      driver: 'postgresql' as const,
      query: "SELECT pg_notify('jobs', 'ready')",
    },
    {
      driver: 'postgresql' as const,
      query: 'WITH lock AS (SELECT pg_advisory_lock(1)) SELECT * FROM lock',
    },
    {
      driver: 'postgresql' as const,
      query: 'SELECT * FROM users FOR UPDATE',
    },
  ];

  for (const current of cases) {
    await assert.rejects(
      () => service.query({ driver: current.driver }, current.query),
      (error: unknown) =>
        error instanceof DatabaseReadonlyError &&
        error.reason === 'invalid-query',
    );
  }

  assert.equal(calls, 0);
});

test('mantém consultas de leitura e agregações válidas', async () => {
  let executedQuery = '';
  const service = new DatabaseReadonlyService(async (_command, args) => {
    const executeIndex = args.findIndex(
      (argument) => argument === '--execute' || argument === '-c',
    );
    executedQuery = args[executeIndex + 1] ?? '';
    return 'total\n42';
  });

  const result = await service.query(
    { driver: 'postgresql' },
    'SELECT COUNT(*) AS total FROM users',
  );

  assert.equal(executedQuery, 'SELECT COUNT(*) AS total FROM users');
  assert.deepEqual(result.rows, [['42']]);
});

test('aceita ponto e vírgula único no fim de uma consulta de leitura', async () => {
  let executedQuery = '';
  const service = new DatabaseReadonlyService(async (_command, args) => {
    executedQuery = args[args.indexOf('--execute') + 1] ?? '';
    return 'id\n1';
  });
  const result = await service.query(
    { driver: 'mysql' },
    "SELECT title FROM posts WHERE title = 'Fórum';",
  );
  assert.equal(executedQuery, "SELECT title FROM posts WHERE title = 'Fórum'");
  assert.deepEqual(result.rows, [['1']]);
});

test('não devolve segredo quando o cliente rejeita as credenciais', async () => {
  const secret = 'senha-super-secreta';
  const service = new DatabaseReadonlyService(async () => {
    const error = new Error(`password authentication failed: ${secret}`) as Error & {
      stderr?: string;
    };
    error.stderr = `role rejected password ${secret}`;
    throw error;
  });

  await assert.rejects(
    () =>
      service.query(
        { driver: 'postgresql', username: 'app', password: secret },
        'SELECT 1',
      ),
    (error: unknown) =>
      error instanceof DatabaseReadonlyError &&
      error.reason === 'command-failed' &&
      !error.message.includes(secret),
  );
});

test('limita o resultado da consulta a cem linhas', async () => {
  const output = [
    'id',
    ...Array.from({ length: 101 }, (_, index) => String(index)),
  ].join('\n');
  const service = new DatabaseReadonlyService(async () => output);
  const result = await service.query(
    { driver: 'postgresql' },
    'SELECT id FROM users',
  );
  assert.equal(result.rows.length, 100);
  assert.equal(result.rowCount, 101);
  assert.equal(result.truncated, true);
});
