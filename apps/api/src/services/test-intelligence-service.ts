import type {
  Project,
  ProjectTestRunner,
  TestIntelligenceEvidence,
  TestIntelligenceSuggestion,
} from '@dev-dashboard/contracts';

import {
  findRelatedTestFiles,
  RelatedTestError,
  RelatedTestService,
  type RelatedTestSelection,
} from './related-test-service.js';
import type { ProjectCoverageHistoryService } from './project-coverage-history-service.js';
import type { ProjectCoverageService } from './project-coverage-service.js';
import type { TestDetectionService } from './test-detection-service.js';
import {
  analyzeStructuredFlakiness,
  buildCoverageDelta,
  type StructuredTestAttempt,
} from './test-intelligence-analysis.js';

export interface StructuredTestAttemptProvider {
  listAttempts(
    project: Project,
    commandId: string,
  ): Promise<StructuredTestAttempt[]>;
}

export interface TestIntelligenceAnalysisDependencies {
  projectCoverageService?: Pick<ProjectCoverageService, 'getSummary'>;
  projectCoverageHistoryService?: Pick<
    ProjectCoverageHistoryService,
    'record' | 'history'
  >;
  structuredTestAttemptProvider?: StructuredTestAttemptProvider;
}

function unknownCoverage(): NonNullable<
  TestIntelligenceSuggestion['coverageDelta']
> {
  return {
    state: 'unknown',
    reason: 'no-current-artifact',
    worsenedFiles: [],
    missingFiles: [],
  };
}

function unknownFlakiness(): NonNullable<
  TestIntelligenceSuggestion['flakiness']
> {
  return {
    state: 'unknown',
    reason: 'no-granular-results',
    tests: [],
  };
}

function unknownSuggestion(
  commandId: string,
  selection?: Partial<RelatedTestSelection>,
): TestIntelligenceSuggestion {
  return {
    commandId,
    state: 'unknown',
    recommendation: 'full-suite',
    baseBranch: selection?.baseBranch ?? 'unknown',
    currentBranch: selection?.currentBranch ?? 'unknown',
    changedFiles: selection?.changedFiles ?? [],
    testFiles: selection?.testFiles ?? [],
    unmappedFiles: selection?.changedFiles ?? [],
    evidence: [],
    coverageDelta: unknownCoverage(),
    flakiness: unknownFlakiness(),
  };
}

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
    coverageDelta: unknownCoverage(),
    flakiness: unknownFlakiness(),
  };
}

export class TestIntelligenceService {
  private readonly relatedTestService: RelatedTestService;

  public constructor(
    private readonly testDetectionService: TestDetectionService,
    private readonly analysis: TestIntelligenceAnalysisDependencies = {},
  ) {
    this.relatedTestService = new RelatedTestService(testDetectionService);
  }

  public async suggest(
    project: Project,
    commandId: string,
  ): Promise<TestIntelligenceSuggestion> {
    const overview = await this.testDetectionService.getOverview(project);
    const command = overview.commands.find((entry) => entry.id === commandId);
    if (!command || !command.supportsFileTarget)
      return unknownSuggestion(commandId);

    let selection: RelatedTestSelection;
    try {
      selection = await this.relatedTestService.resolve(project, commandId);
    } catch (error) {
      if (error instanceof RelatedTestError)
        return unknownSuggestion(commandId);
      throw error;
    }

    const available = await this.testDetectionService.listTestFiles(
      project,
      commandId,
    );
    if (!available) return unknownSuggestion(commandId, selection);

    const suggestion = buildTestIntelligenceSuggestion(
      commandId,
      command.runner,
      selection,
      available.map((entry) => entry.path),
    );

    const coverageDelta = await this.coverageDelta(project, selection);
    const flakiness = await this.flakiness(project, commandId);
    return { ...suggestion, coverageDelta, flakiness };
  }

  private async coverageDelta(
    project: Project,
    selection: RelatedTestSelection,
  ): Promise<NonNullable<TestIntelligenceSuggestion['coverageDelta']>> {
    const coverageService = this.analysis.projectCoverageService;
    const historyService = this.analysis.projectCoverageHistoryService;
    if (!coverageService || !historyService) return unknownCoverage();

    try {
      const summary = await coverageService.getSummary(
        project.path,
        project.type,
      );
      if (!summary.available || !summary.generatedAt || !summary.total) {
        return unknownCoverage();
      }
      await historyService.record(project.id, summary, project.path);
      const history = await historyService.history(project.id);
      return buildCoverageDelta(
        history.items,
        summary.generatedAt,
        selection.changedFiles,
      );
    } catch {
      return unknownCoverage();
    }
  }

  private async flakiness(
    project: Project,
    commandId: string,
  ): Promise<NonNullable<TestIntelligenceSuggestion['flakiness']>> {
    const provider = this.analysis.structuredTestAttemptProvider;
    if (!provider) return unknownFlakiness();
    try {
      return analyzeStructuredFlakiness(
        await provider.listAttempts(project, commandId),
      );
    } catch {
      return unknownFlakiness();
    }
  }
}
