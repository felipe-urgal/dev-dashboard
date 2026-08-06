export const TEST_LOG_TONE_CLASSES = [
  'test-log-visual-progress',
  'test-log-visual-file',
  'test-log-visual-summary',
  'test-log-visual-command',
  'test-log-visual-runtime',
  'test-log-visual-stack',
] as const;

export const TEST_LOG_ROW_TONE_CLASSES = [
  'tests-log-line-default',
  'tests-log-line-success',
  'tests-log-line-error',
  'tests-log-line-warning',
  'tests-log-line-muted',
] as const;

export const RSPEC_PROGRESS_PATTERN = /^[.·•*EFSPX]+$/i;
export const TEST_FILE_PATTERN =
  /(?:^|\s)(?:spec|test|tests|__tests__)\/[\w./@-]+|[\w./@-]+(?:\.spec|\.test|_spec|_test)\.(?:[cm]?[jt]sx?|rb|py)\b/i;
