export type TestLogSemanticTone =
  | 'default'
  | 'success'
  | 'error'
  | 'warning'
  | 'muted';

const RSPEC_PROGRESS_PATTERN = /^[.·•*EFSPX]+$/i;

export function normalizedTestLogLine(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function hasNonZeroFailureSummary(line: string): boolean {
  return (
    /\b[1-9]\d*\s+(?:failed|failures|errors)\b/i.test(line) ||
    /\b\d+\s+(?:runs?|examples?),[^\n]*\b[1-9]\d*\s+(?:failures?|errors?)\b/i.test(
      line,
    )
  );
}

export function isTestLogSuccessLine(value: string): boolean {
  const line = normalizedTestLogLine(value);
  if (!line) return false;

  if (/^(?:✓|✔|PASS\b|ok\b)/i.test(line)) return true;
  if (
    RSPEC_PROGRESS_PATTERN.test(line) &&
    !/[EFX]/i.test(line) &&
    /[.·•*]/.test(line)
  ) {
    return true;
  }
  if (
    /\b[1-9]\d*\s+(?:passed|success(?:ful)?)\b/i.test(line) &&
    !hasNonZeroFailureSummary(line)
  ) {
    return true;
  }
  if (
    /\b0\s+(?:failed|failures|errors)\b/i.test(line) &&
    /\b(?:tests?|runs?|examples?|assertions?)\b/i.test(line)
  ) {
    return true;
  }

  return false;
}

export function isTestLogErrorLine(value: string): boolean {
  const line = normalizedTestLogLine(value);
  if (!line || isTestLogSuccessLine(line)) return false;

  if (
    /\b0\s+(?:failed|failures|errors)\b/i.test(line) &&
    !hasNonZeroFailureSummary(line)
  ) {
    return false;
  }
  if (/^(?:✗|✘|×|FAIL(?:ED)?\b)/i.test(line)) return true;
  if (RSPEC_PROGRESS_PATTERN.test(line) && /[EFX]/i.test(line)) return true;
  if (/^(?:Failures?:|Failed examples:)\s*$/i.test(line)) return true;
  if (/^\d+\)\s+\S/.test(line)) return true;
  if (
    /^(?:Failure\/Error:|AssertionError\b|Error:|TypeError\b|ReferenceError\b|SyntaxError\b|NoMethodError\b|NameError\b|RuntimeError\b|LoadError\b)/i.test(
      line,
    )
  ) {
    return true;
  }
  if (/^(?:expected|got|received|actual):/i.test(line)) return true;
  if (hasNonZeroFailureSummary(line)) return true;
  if (
    /\b(?:failed to|undefined method|cannot\b|enoent\b|unexpected\b|unhandled\b)/i.test(
      line,
    )
  ) {
    return true;
  }
  return /\b(?:test|suite|build|command|runner)\s+(?:has\s+)?failed\b/i.test(
    line,
  );
}

export function isTestLogWarningLine(value: string): boolean {
  const line = normalizedTestLogLine(value);
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(line);
}

export function classifyTestLogSemanticTone(
  value: string,
): TestLogSemanticTone {
  const line = normalizedTestLogLine(value);
  if (!line) return 'default';
  if (isTestLogErrorLine(line)) return 'error';
  if (isTestLogWarningLine(line)) return 'warning';
  if (isTestLogSuccessLine(line)) return 'success';
  if (
    /^(?:RUN\b|Test Files?\b|Tests?\b|Start at\b|Duration\b|Finished in\b|Done in\b|Run options:\b|# Running tests:\b)/i.test(
      line,
    )
  ) {
    return 'muted';
  }
  return 'default';
}
