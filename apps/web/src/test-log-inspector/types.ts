export type TestLogInspectorMode = 'log' | 'errors' | 'warnings' | 'details';

export interface ParsedTestFailure {
  id: string;
  title: string;
  type: string;
  assertion: string;
  expected?: string;
  actual?: string;
  file?: string;
  line?: number;
  stack: string[];
  raw: string[];
}

export interface ParsedTestReport {
  failures: ParsedTestFailure[];
  failedExamples: string[];
  passed?: number;
  failed?: number;
  total?: number;
  seed?: string;
  duration?: string;
  warningCount: number;
  errorCount: number;
}

export interface InspectorState {
  rawLog: string;
  query: string;
  wrapLines: boolean;
  failuresOnly: boolean;
  selectedFailure: number;
  signature: string;
}
