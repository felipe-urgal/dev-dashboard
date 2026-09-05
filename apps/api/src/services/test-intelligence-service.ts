import type {
  Project,
  ProjectTestRunner,
  TestIntelligenceEvidence,
  TestIntelligenceSuggestion,
} from '@dev-dashboard/contracts';

import {
  findRelatedTestFiles,
  RelatedTestService,
  type RelatedTestSelection,
} from './related-test-service.js';
import type { TestDetectionService } from './test-detection-service.js';

export function buildTestIntelligenceSuggestion(
  commandId: string,
  runner: ProjectTestRunner,
  selection: RelatedTestSelection,
  availableTestFiles: string[],
): TestIntelligenceSuggestion {
  const evidence: TestIntelligenceEvidence[] = [];
  const unmappedFiles: string[] = [];

  for (const changedFile of selection.changedFiles) {
    const directMatches = findRelatedTestFiles(
      [changedFile],
      availableTestFiles,
      runner,
    );
    if (directMatches.length === 0) {
      unmappedFiles.push(changedFile);
      continue;
    }
    evidence.push({
      kind: 'direct-file-match',
      changedFile,
      testFiles: directMatches,
    });
  }

  const hasCompleteDirectEvidence =
    selection.changedFiles.length > 0 &&
    selection.testFiles.length > 0 &&
    unmappedFiles.length === 0;

  return {
    commandId,
    state: hasCompleteDirectEvidence ? 'direct' : 'unknown',
    recommendation: hasCompleteDirectEvidence ? 'targeted' : 'full-suite',
    baseBranch: selection.baseBranch,
    currentBranch: selection.currentBranch,
    changedFiles: selection.changedFiles,
    testFiles: selection.testFiles,
    unmappedFiles,
    evidence,
  };
}

export class TestIntelligenceService {
  private readonly relatedTestService: RelatedTestService;

  public constructor(private readonly testDetectionService: TestDetectionService) {
    this.relatedTestService = new RelatedTestService(testDetectionService);
  }

  public async suggest(
    project: Project,
    commandId: string,
  ): Promise<TestIntelligenceSuggestion> {
    const overview = await this.testDetectionService.getOverview(project);
    const command = overview.commands.find((entry) => entry.id === commandId);
    if (!command) {
      return {
        commandId,
        state: 'unknown',
        recommendation: 'full-suite',
        baseBranch: 'unknown',
        currentBranch: 'unknown',
        changedFiles: [],
        testFiles: [],
        unmappedFiles: [],
        evidence: [],
      };
    }

    const selection = await this.relatedTestService.resolve(project, commandId);
    const available =
      (await this.testDetectionService.listTestFiles(project, commandId)) ?? [];

    return buildTestIntelligenceSuggestion(
      commandId,
      command.runner,
      selection,
      available.map((entry) => entry.path),
    );
  }
}
