import type {
  ProjectTestRunner,
  TestFailure,
  TestFailureLocation,
} from '@dev-dashboard/contracts';

interface ParseTestFailuresOptions {
  projectPath?: string;
  limit?: number;
}

interface FailureBlock {
  name: string;
  lines: string[];
}

const TEST_FILE_EXTENSION = /\.(?:[cm]?[jt]sx?|rb|py)$/i;
const LOCATION_PATTERN =
  /(?:file:\/\/)?((?:[A-Za-z]:)?[^\s()[\]{}'\"]+?\.(?:[cm]?[jt]sx?|rb|py)):(\d+)(?::(\d+))?/i;
const DEFAULT_LIMIT = 50;
const STACK_LIMIT = 8;

export function parseTestFailures(
  rawLog: string,
  runner: ProjectTestRunner,
  options: ParseTestFailuresOptions = {},
): TestFailure[] {
  const lines = stripAnsi(rawLog).replace(/\r/g, '').split('\n');
  const blocks = collectBlocks(lines, runner);
  const limit = Math.max(
    1,
    Math.min(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT),
  );
  const failures = blocks
    .map((block, index) => toFailure(block, runner, options.projectPath, index))
    .filter((failure): failure is TestFailure => failure !== null);

  const seen = new Set<string>();
  return failures
    .filter((failure) => {
      const key = [
        failure.name,
        failure.location?.path ?? '',
        failure.location?.line ?? '',
        failure.message,
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function collectBlocks(
  lines: string[],
  runner: ProjectTestRunner,
): FailureBlock[] {
  if (runner === 'rspec') return collectRspecBlocks(lines);
  if (runner === 'rails-test' || runner === 'minitest') {
    return collectMinitestBlocks(lines);
  }
  if (runner === 'pytest') return collectPytestBlocks(lines);
  if (runner === 'node-test') return collectNodeTestBlocks(lines);
  return collectJavaScriptBlocks(lines);
}

function collectJavaScriptBlocks(lines: string[]): FailureBlock[] {
  return collectByHeading(lines, (line) => {
    const trimmed = line.trim();
    const fail = /^FAIL\s+(.+?)(?:\s+>\s+(.+))?$/.exec(trimmed);
    if (fail) return fail[2]?.trim() || fail[1]!.trim();
    const marker = /^(?:[×✕●]\s+)(.+)$/.exec(trimmed);
    return marker?.[1]?.trim();
  });
}

function collectRspecBlocks(lines: string[]): FailureBlock[] {
  return collectByHeading(lines, (line) => {
    const match = /^\s*\d+\)\s+(.+)$/.exec(line);
    return match?.[1]?.trim();
  });
}

function collectMinitestBlocks(lines: string[]): FailureBlock[] {
  const blocks: FailureBlock[] = [];
  const failureStart = /^\s*(?:\d+\)\s+)?Failure:\s*$/;
  const structuredName = /^[A-Za-z_][\w:]*#[^\s\[]+\s+\[[^\]]+\]:?\s*$/;

  for (let index = 0; index < lines.length; index += 1) {
    if (!failureStart.test(lines[index] ?? '')) continue;
    const blockLines: string[] = [];
    index += 1;
    while (index < lines.length) {
      const line = lines[index]!;
      if (index > 0 && failureStart.test(line)) break;
      if (/^Finished in\s+/i.test(line.trim())) break;
      blockLines.push(line);
      index += 1;
    }

    const structuredNameLine = blockLines.find((line) =>
      structuredName.test(line.trim()),
    );
    const name =
      (structuredNameLine ?? blockLines[0] ?? '')
        .trim()
        .replace(/\s*\[[^\]]+\]:?\s*$/, '') || 'Teste Minitest falhou';
    const location = extractLocation(blockLines, undefined);
    if (location && !blockLines.some((line) => line.includes(location.path))) {
      blockLines.unshift(`${location.path}:${location.line ?? 1}`);
    }
    blocks.push({ name, lines: blockLines });
    index -= 1;
  }
  return blocks;
}

function collectPytestBlocks(lines: string[]): FailureBlock[] {
  const detailed = collectByHeading(lines, (line) => {
    const match = /^_{2,}\s+(.+?)\s+_{2,}$/.exec(line.trim());
    return match?.[1]?.trim();
  });
  if (detailed.length > 0) return detailed;

  return lines.flatMap((line) => {
    const match = /^FAILED\s+(.+?)(?:\s+-\s+(.+))?$/.exec(line.trim());
    if (!match) return [];
    const target = match[1]!.trim();
    const name = target.split('::').at(-1) || target;
    return [{ name, lines: [match[2] ?? 'Teste falhou.', target] }];
  });
}

function collectNodeTestBlocks(lines: string[]): FailureBlock[] {
  return collectByHeading(lines, (line) => {
    const match = /^\s*not ok\s+\d+\s+-\s+(.+)$/.exec(line);
    return match?.[1]?.trim();
  });
}

function collectByHeading(
  lines: string[],
  heading: (line: string) => string | undefined,
): FailureBlock[] {
  const starts: Array<{ index: number; name: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const name = heading(lines[index] ?? '');
    if (name) starts.push({ index, name });
  }

  return starts.map((start, position) => ({
    name: start.name,
    lines: lines.slice(
      start.index + 1,
      starts[position + 1]?.index ?? lines.length,
    ),
  }));
}

function toFailure(
  block: FailureBlock,
  runner: ProjectTestRunner,
  projectPath: string | undefined,
  index: number,
): TestFailure | null {
  const trimmedLines = block.lines.map((line) => line.trimEnd());
  const location =
    extractLocation(trimmedLines, projectPath) ??
    extractPathOnly(trimmedLines, projectPath);
  const message = extractMessage(trimmedLines, runner);
  if (!message && !location) return null;

  const expected = extractValue(
    trimmedLines,
    /^(?:Expected|expected):?\s*(.+)$/i,
  );
  const actual = extractValue(
    trimmedLines,
    /^(?:Received|Actual|actual):?\s*(.+)$/i,
  );
  const stack = trimmedLines
    .filter((line) => isStackLine(line))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, STACK_LIMIT);

  return {
    id: `${runner}-${index}-${hash(`${block.name}|${location?.path ?? ''}|${location?.line ?? ''}`)}`,
    runner,
    name: cleanName(block.name),
    message: message || 'O runner informou uma falha sem mensagem estruturada.',
    ...(location ? { location } : {}),
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    stack,
  };
}

function extractMessage(lines: string[], runner: ProjectTestRunner): string {
  const ignored = [
    /^\s*$/,
    /^at\s+/i,
    /^#\s+\.\//,
    /^location:/i,
    /^duration_ms:/i,
    /^failureType:/i,
    /^code:/i,
    /^Expected:/i,
    /^Received:/i,
    /^Actual:/i,
    /^Diff:/i,
    /^Failure\/Error:/i,
    /^E\s+[^:]+:\d+/,
  ];

  if (runner === 'pytest') {
    const pytestError = lines.find((line) => /^E\s{2,}\S/.test(line));
    if (pytestError) return pytestError.replace(/^E\s+/, '').trim();
  }

  const explicit = lines.find((line) =>
    /^(?:AssertionError|Error|TypeError|ReferenceError|RuntimeError|NoMethodError|Failure|error):/i.test(
      line.trim(),
    ),
  );
  if (explicit) return explicit.trim();

  const failureErrorIndex = lines.findIndex((line) =>
    /^\s*Failure\/Error:/i.test(line),
  );
  if (failureErrorIndex >= 0) {
    const following = lines
      .slice(failureErrorIndex + 1)
      .find((line) => line.trim() && !isStackLine(line));
    if (following) return following.trim();
  }

  return (
    lines
      .find((line) => {
        const value = line.trim();
        return (
          value.length > 0 &&
          !ignored.some((pattern) => pattern.test(value)) &&
          !extractLocation([value], undefined)
        );
      })
      ?.trim() ?? ''
  );
}

function extractValue(lines: string[], pattern: RegExp): string | undefined {
  for (const line of lines) {
    const match = pattern.exec(line.trim());
    if (match?.[1]) return match[1].trim().slice(0, 500);
  }
  return undefined;
}

function extractLocation(
  lines: string[],
  projectPath: string | undefined,
): TestFailureLocation | undefined {
  for (const line of lines) {
    const match = LOCATION_PATTERN.exec(line);
    if (!match) continue;
    const relativePath = normalizeProjectPath(match[1]!, projectPath);
    if (!relativePath) continue;
    const lineNumber = Number.parseInt(match[2]!, 10);
    const column = match[3] ? Number.parseInt(match[3], 10) : undefined;
    return {
      path: relativePath,
      ...(Number.isInteger(lineNumber) && lineNumber > 0
        ? { line: lineNumber }
        : {}),
      ...(column && column > 0 ? { column } : {}),
    };
  }
  return undefined;
}

function extractPathOnly(
  lines: string[],
  projectPath: string | undefined,
): TestFailureLocation | undefined {
  for (const line of lines) {
    const match =
      /((?:[A-Za-z]:)?[^\s()[\]{}'\"]+?\.(?:[cm]?[jt]sx?|rb|py))(?:::\S+)?/i.exec(
        line,
      );
    if (!match) continue;
    const relativePath = normalizeProjectPath(match[1]!, projectPath);
    if (relativePath) return { path: relativePath };
  }
  return undefined;
}

function normalizeProjectPath(
  rawPath: string,
  projectPath: string | undefined,
): string | undefined {
  let value = rawPath.replace(/^file:\/\//, '').replace(/\\/g, '/');
  const normalizedProject = projectPath?.replace(/\\/g, '/').replace(/\/$/, '');
  if (normalizedProject && value.startsWith(`${normalizedProject}/`)) {
    value = value.slice(normalizedProject.length + 1);
  }
  value = value.replace(/^\.\//, '');
  if (!value || value.startsWith('/') || /^[A-Za-z]:\//.test(value))
    return undefined;
  const segments = value.split('/');
  if (segments.some((segment) => segment === '..' || segment === ''))
    return undefined;
  if (!TEST_FILE_EXTENSION.test(value)) return undefined;
  return value;
}

function isStackLine(line: string): boolean {
  const value = line.trim();
  return (
    /^at\s+/i.test(value) ||
    /^#\s+\.\//.test(value) ||
    /^from\s+/.test(value) ||
    Boolean(LOCATION_PATTERN.exec(value))
  );
}

function cleanName(value: string): string {
  return (
    value
      .replace(/^FAIL\s+/, '')
      .replace(/^FAILED\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) || 'Teste com falha'
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
