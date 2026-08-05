import { readFile, writeFile, unlink } from 'node:fs/promises';

const parserPath = 'apps/web/src/composables/project-test-failures.ts';
let parser = await readFile(parserPath, 'utf8');
const functionStart = parser.indexOf('function collectMinitestBlocks(');
const functionEnd = parser.indexOf('\nfunction collectPytestBlocks(', functionStart);
if (functionStart < 0 || functionEnd < 0) {
  throw new Error('Função collectMinitestBlocks não encontrada.');
}

const replacement = `function collectMinitestBlocks(lines: string[]): FailureBlock[] {
  const blocks: FailureBlock[] = [];
  const failureStart = /^\\s*\\d+\\)\\s+Failure:\\s*$/;
  const structuredName = /^[A-Za-z_][\\w:]*#[^\\s\\[]+\\s+\\[[^\\]]+\\]:?\\s*$/;

  for (let index = 0; index < lines.length; index += 1) {
    if (!failureStart.test(lines[index] ?? '')) continue;
    const blockLines: string[] = [];
    index += 1;
    while (index < lines.length) {
      const line = lines[index]!;
      if (index > 0 && failureStart.test(line)) break;
      if (/^Finished in\\s+/i.test(line.trim())) break;
      blockLines.push(line);
      index += 1;
    }

    const structuredNameLine = blockLines.find((line) =>
      structuredName.test(line.trim()),
    );
    const name = (structuredNameLine ?? blockLines[0] ?? '')
      .trim()
      .replace(/\\s*\\[[^\\]]+\\]:?\\s*$/, '')
      || 'Teste Minitest falhou';
    const location = extractLocation(blockLines, undefined);
    if (location && !blockLines.some((line) => line.includes(location.path))) {
      blockLines.unshift(\`\${location.path}:\${location.line ?? 1}\`);
    }
    blocks.push({ name, lines: blockLines });
    index -= 1;
  }
  return blocks;
}
`;
parser = parser.slice(0, functionStart) + replacement + parser.slice(functionEnd);
await writeFile(parserPath, parser, 'utf8');

const testPath = 'apps/web/test/project-test-failures.test.ts';
let tests = await readFile(testPath, 'utf8');
const regressionName = 'prioriza o identificador estruturado sobre o título genérico do Minitest';
if (!tests.includes(regressionName)) {
  const insertionPoint = tests.lastIndexOf('\n});');
  if (insertionPoint < 0) throw new Error('Fechamento da suíte de parsers não encontrado.');
  const regression = `\n\n  it('${regressionName}', () => {\n    const failures = parseTestFailures(\`\n1) Failure:\ntest: test_requires_email.\nExpected false to be truthy.\nUserTest#test_requires_email [/workspace/app/test/models/user_test.rb:18]:\n\`, 'rails-test', { projectPath: '/workspace/app' });\n\n    expect(failures[0]).toMatchObject({\n      name: 'UserTest#test_requires_email',\n      location: {\n        path: 'test/models/user_test.rb',\n        line: 18,\n      },\n    });\n  });`;
  tests = tests.slice(0, insertionPoint) + regression + tests.slice(insertionPoint);
  await writeFile(testPath, tests, 'utf8');
}

await unlink('scripts/task-100-minitest-fix.mjs');
await unlink('.github/workflows/task-100-minitest-fix.yml');
