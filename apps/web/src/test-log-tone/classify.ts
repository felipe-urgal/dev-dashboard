import { RSPEC_PROGRESS_PATTERN, TEST_FILE_PATTERN } from './constants';
import type { TestLogSemanticTone, TestLogVisualTone } from './types';

export function normalizedLine(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function hasNonZeroFailureSummary(line: string): boolean {
  return (
    /\b[1-9]\d*\s+(?:failed|failures|errors)\b/i.test(line)
    || /\b\d+\s+(?:runs?|examples?),[^\n]*\b[1-9]\d*\s+(?:failures?|errors?)\b/i.test(line)
  );
}

export function isTestLogSuccessLine(value: string): boolean {
  const line = normalizedLine(value);
  if (!line) return false;

  if (/^(?:✓|✔|PASS\b|ok\b)/i.test(line)) return true;
  if (RSPEC_PROGRESS_PATTERN.test(line) && !/[EFX]/i.test(line) && /[.·•*]/.test(line)) return true;
  if (/\b[1-9]\d*\s+(?:passed|success(?:ful)?)\b/i.test(line) && !hasNonZeroFailureSummary(line)) return true;
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(line) && /\b(?:tests?|runs?|examples?|assertions?)\b/i.test(line)) return true;

  return false;
}

export function isTestLogErrorLine(value: string): boolean {
  const line = normalizedLine(value);
  if (!line || isTestLogSuccessLine(line)) return false;

  if (/\b0\s+(?:failed|failures|errors)\b/i.test(line) && !hasNonZeroFailureSummary(line)) return false;
  if (/^(?:✗|✘|×|FAIL(?:ED)?\b)/i.test(line)) return true;
  if (RSPEC_PROGRESS_PATTERN.test(line) && /[EFX]/i.test(line)) return true;
  if (/^(?:Failures?:|Failed examples:)\s*$/i.test(line)) return true;
  if (/^\d+\)\s+\S/.test(line)) return true;
  if (/^(?:Failure\/Error:|AssertionError\b|Error:|TypeError\b|ReferenceError\b|SyntaxError\b|NoMethodError\b|NameError\b|RuntimeError\b|LoadError\b)/i.test(line)) return true;
  if (/^(?:expected|got|received|actual):/i.test(line)) return true;
  if (hasNonZeroFailureSummary(line)) return true;
  if (/\b(?:failed to|undefined method|cannot\b|enoent\b|unexpected\b|unhandled\b)/i.test(line)) return true;
  if (/\b(?:test|suite|build|command|runner)\s+(?:has\s+)?failed\b/i.test(line)) return true;

  return false;
}

export function isTestLogWarningLine(value: string): boolean {
  const line = normalizedLine(value);
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(line);
}

export function classifyTestLogSemanticTone(value: string): TestLogSemanticTone {
  const line = normalizedLine(value);
  if (!line) return 'default';
  if (isTestLogErrorLine(line)) return 'error';
  if (isTestLogWarningLine(line)) return 'warning';
  if (isTestLogSuccessLine(line)) return 'success';
  if (/^(?:RUN\b|Test Files?\b|Tests?\b|Start at\b|Duration\b|Finished in\b|Done in\b|Run options:\b|# Running tests:\b)/i.test(line)) return 'muted';
  return 'default';
}

export function classifyTestLogLine(value: string): TestLogVisualTone | null {
  const line = normalizedLine(value);
  if (!line) return null;

  if (RSPEC_PROGRESS_PATTERN.test(line) && line.length >= 3) {
    return 'progress';
  }

  if (
    /^(?:\$|>\s|yarn(?:\s+run)?\b|npm(?:\s+run)?\b|pnpm\b|bun\b|bundle exec\b|bin\/rails\b|rails test\b|ruby\b)/i.test(line)
  ) {
    return 'command';
  }

  if (
    /^(?:✓|✔|✗|✘|×|PASS\b|FAIL(?:ED)?\b|ok\b)/i.test(line)
    || TEST_FILE_PATTERN.test(line)
  ) {
    return 'file';
  }

  if (
    /^(?:RUN\b|Test Files?\b|Tests?\b|Start at\b|Duration\b|Finished in\b|Done in\b|Run options:\b|# Running tests:\b)/i.test(line)
    || /^\d+\s+(?:runs?|examples?),\s*\d+\s+(?:assertions?|failures?)/i.test(line)
  ) {
    return 'summary';
  }

  if (
    /^\(?node:\d+\)?/i.test(line)
    || /^Timeout duration was set to/i.test(line)
    || /^Use `node --trace-warnings/i.test(line)
  ) {
    return 'runtime';
  }

  if (
    /^(?:at\s+|from\s+|#\s*\.?\/|#\d+\s+)/i.test(line)
    || /^[A-Za-z]:\\.*:\d+(?::\d+)?/.test(line)
    || /^\/.*:\d+(?::\d+)?/.test(line)
  ) {
    return 'stack';
  }

  return null;
}
