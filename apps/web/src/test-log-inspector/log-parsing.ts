import { STACK_PATH_PATTERN } from './constants';
import {
  cleanLines,
  compact,
  isErrorText,
  isWarningText,
} from './text-helpers';
import type { ParsedTestFailure, ParsedTestReport } from './types';

function parseSummary(
  lines: string[],
): Omit<
  ParsedTestReport,
  'failures' | 'failedExamples' | 'warningCount' | 'errorCount'
> {
  const source = lines.join('\n');
  const rspec = /\b(\d+)\s+examples?,\s*(\d+)\s+failures?/i.exec(source);
  const rails =
    /\b(\d+)\s+runs?,\s*(\d+)\s+assertions?,\s*(\d+)\s+failures?,\s*(\d+)\s+errors?/i.exec(
      source,
    );
  const vitestPassed =
    /\bTests\s+(\d+)\s+passed\b/i.exec(source) ??
    /\b(\d+)\s+tests?\s+passed\b/i.exec(source);
  const vitestFailed =
    /\bTests\s+(?:\d+\s+passed\s*\|\s*)?(\d+)\s+failed\b/i.exec(source) ??
    /\b(\d+)\s+tests?\s+failed\b/i.exec(source);

  let total: number | undefined;
  let failed: number | undefined;
  let passed: number | undefined;
  if (rspec) {
    total = Number(rspec[1]);
    failed = Number(rspec[2]);
    passed = Math.max(0, total - failed);
  } else if (rails) {
    total = Number(rails[1]);
    failed = Number(rails[3]) + Number(rails[4]);
    passed = Math.max(0, total - failed);
  } else {
    passed = vitestPassed?.[1] ? Number(vitestPassed[1]) : undefined;
    failed = vitestFailed?.[1] ? Number(vitestFailed[1]) : undefined;
    if (passed !== undefined || failed !== undefined)
      total = (passed ?? 0) + (failed ?? 0);
  }

  const duration =
    /\bFinished in\s+([^\n]+)/i.exec(source)?.[1]?.trim() ??
    /\bDuration\s+([^\n]+)/i.exec(source)?.[1]?.trim() ??
    /\bDone in\s+([^\n]+)/i.exec(source)?.[1]?.trim();
  const seed =
    /\bRandomized with seed\s+(\d+)/i.exec(source)?.[1] ??
    /\bseed\s+(\d+)/i.exec(source)?.[1];

  return {
    ...(total !== undefined ? { total } : {}),
    ...(failed !== undefined ? { failed } : {}),
    ...(passed !== undefined ? { passed } : {}),
    ...(duration ? { duration } : {}),
    ...(seed ? { seed } : {}),
  };
}

function failureBlocks(lines: string[]): string[][] {
  const failuresStart = lines.findIndex((line) =>
    /^\s*Failures:\s*$/i.test(line),
  );
  const start = failuresStart >= 0 ? failuresStart + 1 : 0;
  const indexes: number[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^\s*\d+\)\s+\S/.test(lines[index] ?? '')) indexes.push(index);
  }

  if (indexes.length > 0) {
    return indexes.map((blockStart, position) => {
      const next = indexes[position + 1] ?? lines.length;
      let end = next;
      for (let index = blockStart + 1; index < next; index += 1) {
        if (
          /^\s*(?:Failed examples:|Finished in\b|\d+\s+examples?,)/i.test(
            lines[index] ?? '',
          )
        ) {
          end = index;
          break;
        }
      }
      return lines.slice(blockStart, end);
    });
  }

  const fallback = lines.findIndex((line) =>
    /Failure\/Error:|AssertionError|expected.+(?:got|received)/i.test(line),
  );
  return fallback < 0
    ? []
    : [
        lines.slice(
          Math.max(0, fallback - 2),
          Math.min(lines.length, fallback + 12),
        ),
      ];
}

function stackCandidates(block: string[]): string[] {
  const explicit = block.filter((line) =>
    /^\s*(?:#|at\s+|from\s+)/i.test(line),
  );
  const testPaths = block.filter((line) =>
    /(?:^|\s)(?:\.{0,2}\/)?(?:spec|test|tests|__tests__)\//i.test(line),
  );
  return [...explicit, ...testPaths].filter(
    (line, index, values) => values.indexOf(line) === index,
  );
}

function parseLocation(block: string[]): { file?: string; line?: number } {
  for (const value of stackCandidates(block)) {
    const match = STACK_PATH_PATTERN.exec(value);
    if (match?.[1] && match[2])
      return { file: match[1], line: Number(match[2]) };
  }
  return {};
}

function parseFailure(block: string[], index: number): ParsedTestFailure {
  const heading = block.find((line) => /^\s*\d+\)\s+\S/.test(line));
  const title =
    compact(heading?.replace(/^\s*\d+\)\s+/, '')) ?? `Falha ${index + 1}`;
  const failureIndex = block.findIndex((line) =>
    /Failure\/Error:|AssertionError/i.test(line),
  );
  const failureLine = failureIndex >= 0 ? block[failureIndex] : undefined;
  const inline = failureLine
    ?.replace(/^.*?(?:Failure\/Error:|AssertionError:?)/i, '')
    .trim();
  const following =
    failureIndex >= 0
      ? block
          .slice(failureIndex + 1)
          .find((line) => line.trim() && !STACK_PATH_PATTERN.test(line))
          ?.trim()
      : undefined;
  const assertion = compact(inline) ?? compact(following) ?? title;
  const expectedLine = block.find((line) =>
    /^\s*(?:expected|Expected):/i.test(line),
  );
  const actualLine = block.find((line) =>
    /^\s*(?:got|received|Received|actual):/i.test(line),
  );
  const expected = compact(
    expectedLine?.replace(/^\s*(?:expected|Expected):\s*/i, ''),
  );
  const actual = compact(
    actualLine?.replace(/^\s*(?:got|received|Received|actual):\s*/i, ''),
  );
  const location = parseLocation(block);
  const stack = stackCandidates(block)
    .map((line) => line.trim())
    .slice(0, 8);
  const type =
    failureLine?.match(
      /Failure\/Error|AssertionError|[A-Z][A-Za-z]+Error/,
    )?.[0] ?? (expected || actual ? 'Falha de assertion' : 'Falha de teste');

  return {
    id: `failure-${index + 1}`,
    title,
    type,
    assertion,
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    ...location,
    stack,
    raw: block,
  };
}

function failedExamples(lines: string[]): string[] {
  const start = lines.findIndex((line) =>
    /^\s*Failed examples:\s*$/i.test(line),
  );
  if (start < 0) return [];
  return lines
    .slice(start + 1)
    .filter((line) => /^\s*(?:rspec|bin\/rails test|pytest)\s+/i.test(line))
    .map((line) => line.trim())
    .slice(0, 20);
}

export function parseTestLog(value: string): ParsedTestReport {
  const lines = cleanLines(value);
  const failures = failureBlocks(lines).map(parseFailure);
  if (failures.length === 0) {
    const errors = lines.filter(isErrorText).slice(0, 12);
    if (errors.length > 0) {
      const location = parseLocation(errors);
      failures.push({
        id: 'failure-1',
        title: 'Falha identificada no log',
        type: errors[0]?.match(/[A-Z][A-Za-z]+Error/)?.[0] ?? 'Erro do runner',
        assertion: errors[0] ?? 'Falha de teste',
        ...location,
        stack: stackCandidates(errors).map((line) => line.trim()),
        raw: errors,
      });
    }
  }
  return {
    failures,
    failedExamples: failedExamples(lines),
    ...parseSummary(lines),
    warningCount: lines.filter(isWarningText).length,
    errorCount: lines.filter(isErrorText).length,
  };
}
