import { describe, expect, it } from 'vitest';

import { parseTestFailures } from '../src/composables/project-test-failures';

describe('parseTestFailures', () => {
  it('estrutura falha de Vitest com comparação e posição', () => {
    const failures = parseTestFailures(
      `
FAIL  src/math.test.ts > soma > retorna o total
AssertionError: expected 3 to be 4
Expected: 4
Received: 3
 ❯ src/math.test.ts:12:8
`,
      'vitest',
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      runner: 'vitest',
      name: 'soma > retorna o total',
      message: 'AssertionError: expected 3 to be 4',
      expected: '4',
      actual: '3',
      location: { path: 'src/math.test.ts', line: 12, column: 8 },
    });
  });

  it('normaliza caminho absoluto de RSpec dentro do projeto', () => {
    const failures = parseTestFailures(
      `
  1) User valida email
     Failure/Error: expect(user).to be_valid
       expected valid, got errors
     # /workspace/app/spec/models/user_spec.rb:24
`,
      'rspec',
      { projectPath: '/workspace/app' },
    );

    expect(failures[0]).toMatchObject({
      name: 'User valida email',
      location: { path: 'spec/models/user_spec.rb', line: 24 },
    });
  });

  it('estrutura falha de Minitest', () => {
    const failures = parseTestFailures(
      `
Failure:
UserTest#test_name [test/models/user_test.rb:18]:
Expected: "Ana"
  Actual: ""
`,
      'minitest',
    );

    expect(failures[0]).toMatchObject({
      name: 'UserTest#test_name',
      expected: '"Ana"',
      actual: '""',
      location: { path: 'test/models/user_test.rb', line: 18 },
    });
  });

  it('estrutura falha resumida de pytest', () => {
    const failures = parseTestFailures(
      'FAILED tests/test_total.py::test_total - assert 3 == 4',
      'pytest',
    );

    expect(failures[0]).toMatchObject({
      name: 'test_total',
      message: 'assert 3 == 4',
      location: { path: 'tests/test_total.py' },
    });
  });

  it('estrutura falha do Node Test Runner e rejeita caminho fora do projeto', () => {
    const failures = parseTestFailures(
      `
not ok 1 - soma valores
  ---
  error: 'resultado incorreto'
  location: 'file:///workspace/app/test/math.test.js:9:3'
`,
      'node-test',
      { projectPath: '/workspace/app' },
    );

    expect(failures[0]).toMatchObject({
      name: 'soma valores',
      location: { path: 'test/math.test.js', line: 9, column: 3 },
    });

    const outside = parseTestFailures(
      `
not ok 1 - externo
  location: 'file:///tmp/outside.test.js:2:1'
`,
      'node-test',
      { projectPath: '/workspace/app' },
    );
    expect(outside[0]?.location).toBeUndefined();
  });

  it('prioriza o identificador estruturado sobre o título genérico do Minitest', () => {
    const failures = parseTestFailures(
      `
1) Failure:
test: test_requires_email.
Expected false to be truthy.
UserTest#test_requires_email [/workspace/app/test/models/user_test.rb:18]:
`,
      'rails-test',
      { projectPath: '/workspace/app' },
    );

    expect(failures[0]).toMatchObject({
      name: 'UserTest#test_requires_email',
      location: {
        path: 'test/models/user_test.rb',
        line: 18,
      },
    });
  });
});
