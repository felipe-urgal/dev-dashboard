export type TestIntelligenceState = 'direct' | 'impacted' | 'unknown';
export type TestIntelligenceRecommendation = 'targeted' | 'full-suite';

export interface TestIntelligenceEvidence {
  kind: 'direct-file-match';
  changedFile: string;
  testFiles: string[];
}

export interface TestIntelligenceSuggestion {
  commandId: string;
  state: TestIntelligenceState;
  recommendation: TestIntelligenceRecommendation;
  baseBranch: string;
  currentBranch: string;
  changedFiles: string[];
  testFiles: string[];
  unmappedFiles: string[];
  evidence: TestIntelligenceEvidence[];
}
