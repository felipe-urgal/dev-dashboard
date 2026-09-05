export type { Workspace } from './workspace.js';

export type {
  AttentionAction,
  AttentionCategory,
  AttentionDestination,
  AttentionItem,
  AttentionSeverity,
  AttentionUnavailableSource,
  WorkspaceAttention,
} from './attention.js';

export type {
  RetentionSettings,
  RetentionSettingsLimits,
  RetentionSettingsSnapshot,
} from './settings.js';

export type {
  Project,
  ProjectCapability,
  ProjectSource,
  ProjectType,
} from './project.js';

export type {
  DetectedCapability,
  DetectionConfidence,
  DetectionEvidence,
  DetectionEvidenceKind,
  ProjectProfile,
  ProjectProfileDiagnostic,
  ProjectProfileProvider,
  ProjectProfileProviderContext,
} from './project-profile.js';

export type { NodeServerScriptName } from './server-script-catalog.js';
export { NODE_SERVER_SCRIPT_CANDIDATES } from './server-script-catalog.js';

export type {
  ProductionBackupPolicy,
  ProductionCommandId,
  ProductionCommands,
  ProductionContractV1,
  ProductionContractWarning,
  ProductionContractWarningCode,
  ProductionExternalReference,
  ProductionHealthCheck,
  ProductionMigrationPolicy,
  ProductionPolicies,
  ProductionProvider,
  ProductionRollbackPolicy,
  ProductionStrategy,
} from './production.js';

export type {
  Deployment,
  DeploymentCommandPlanStep,
  DeploymentConfirmation,
  DeploymentDriftStatus,
  DeploymentExecutionPhase,
  DeploymentFailurePoint,
  DeploymentHistory,
  DeploymentLog,
  DeploymentPlan,
  DeploymentPlanStep,
  DeploymentProviderAvailability,
  DeploymentProviderIssueCode,
  DeploymentProviderPlanStep,
  DeploymentProviderSnapshot,
  DeploymentProviderState,
  DeploymentProviderTimelineStep,
  DeploymentScriptId,
  DeploymentStatus,
  DeploymentStepId,
  DeploymentStepStatus,
  DeploymentTimelineStep,
  ProductionDeploymentStatus,
  ProductionOverview,
  ProductionOverviewHealth,
  ProductionOverviewItem,
  ProductionOverviewState,
} from './deployment.js';

export type {
  ProjectDiagnosticAction,
  ProjectDiagnosticActionTarget,
  ProjectDiagnosticCategory,
  ProjectDiagnosticCheck,
  ProjectDiagnosticOverallStatus,
  ProjectDiagnosticReport,
  ProjectDiagnosticStatus,
  ProjectDiagnosticSummary,
} from './project-doctor.js';

export type {
  ProjectBrowserOpenResult,
  ProjectBrowserTarget,
} from './browser.js';

export type {
  ProjectDirectoryListing,
  ProjectFileContent,
  ProjectFileCreateRequest,
  ProjectFileEntry,
  ProjectFileKind,
  ProjectFileMutationApplyRequest,
  ProjectFileMutationOperation,
  ProjectFileMutationPreview,
  ProjectFileMutationPreviewRequest,
  ProjectFileMutationResult,
  ProjectFileSearchMatch,
  ProjectFileSearchResult,
  ProjectFileWatchEntry,
  ProjectFileWatchItem,
  ProjectFileWatchRequest,
  ProjectFileWatchResult,
  ProjectFileWatchState,
  ProjectTextPosition,
  ProjectTextRange,
  ProjectWorkspaceEditApplyRequest,
  ProjectWorkspaceEditFilePreview,
  ProjectWorkspaceEditPreview,
  ProjectWorkspaceEditRequest,
  ProjectWorkspaceEditResult,
  ProjectWorkspaceFileEdit,
  ProjectWorkspaceTextEdit,
} from './project-files.js';

export type {
  ProjectLanguageServerKind,
  ProjectLanguageServerState,
  ProjectLanguageServerStatus,
  ProjectRailsLanguageServerStatus,
  ProjectRailsRuntimeConfirmation,
  ProjectRailsRuntimeState,
  ProjectSymbolLocation,
} from './language-server.js';

export type {
  ManagedProcess,
  ManagedProcessKind,
  ManagedProcessStatus,
  ProcessLogSnapshot,
} from './process.js';

export type {
  DeclaredProjectPort,
  DeclaredProjectPortConfidence,
  DeclaredProjectPortSource,
  LocalPortEntry,
  LocalPortExpectation,
  LocalPortExternalProcess,
  LocalPortInspection,
  LocalPortInspectionStatus,
  LocalPortManagedProcess,
  LocalPortScope,
  LocalPortState,
  ObservedPort,
  ObservedPortOwner,
  PortAllocationLeaseRequest,
  PortAllocationLeaseResult,
  PortAllocationRequest,
  PortAllocationResult,
  PortReconciliation,
  PortReconciliationEntry,
  PortReconciliationState,
  PortRegistryConfiguration,
  ReservedPort,
  ReservedPortScope,
} from './port.js';

export type {
  ProjectServerHealth,
  ProjectServerSettings,
  ServerHealthStatus,
  UpdateProjectServerSettingsInput,
} from './server.js';

export type { Job, JobStatus } from './job.js';

export type {
  GitBranch,
  GitBranchKind,
  GitBranchMutationResult,
  GitCommit,
  GitCommitDetailFile,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitFileStatus,
  GitCommitHistoryEntry,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
  GitCommitResult,
  GitDiffFile,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileChange,
  GitFileDiff,
  GitFileLines,
  GitFileStatus,
  GitImageDiffPreview,
  GitImagePreviewContent,
  GitMutationConfirmation,
  GitMutationOperation,
  GitOpenPullRequest,
  GitPullRequestCiStatus,
  GitPullRequestLookup,
  GitPullRequestProvider,
  GitPullRequestUrl,
  GitRemote,
  GitRemoteRole,
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from './git.js';

export type {
  GitPullRequestCheck,
  GitPullRequestCockpit,
  GitPullRequestRemoteStatus,
  GitPullRequestReviewState,
} from './git-pull-request-cockpit.js';

export type {
  GitMutationCatalogEntry,
  GitMutationRiskLevel,
} from './git-mutation-catalog.js';
export {
  GIT_MUTATION_CATALOG,
  GIT_MUTATION_CATALOG_BY_ID,
  findGitMutationCatalogEntry,
} from './git-mutation-catalog.js';

export type {
  GitMutationHistoryEvent,
  GitMutationHistoryPage,
  GitMutationHistoryResult,
} from './git-mutation-history.js';

export type {
  GitPullRequestMergeMethod,
  GitPullRequestMutationActionId,
  GitPullRequestMutationConfirmation,
  GitPullRequestMutationResult,
  GitPullRequestMutationState,
} from './git-pull-request-mutation.js';

export type {
  ProjectTestCommand,
  ProjectTestFile,
  ProjectTestOrigin,
  ProjectTestOverview,
  ProjectTestRunner,
  TestFailure,
  TestFailureLocation,
  TestExecutionEvent,
  TestExecutionHistory,
  TestExecutionRecord,
  TestExecutionScope,
  TestExecutionStatus,
} from './test.js';

export type {
  TestCoverageDeltaAnalysis,
  TestCoverageDeltaUnknownReason,
  TestCoverageFileDelta,
  TestCoverageMetricDelta,
  TestFlakinessAnalysis,
  TestFlakinessEvidence,
  TestFlakinessUnknownReason,
  TestFlakyTest,
  TestIntelligenceEvidence,
  TestIntelligenceRecommendation,
  TestIntelligenceState,
  TestIntelligenceSuggestion,
  TestOutcome,
} from './test-intelligence.js';

export type {
  ProjectCoverageFileSummary,
  ProjectCoverageHistory,
  ProjectCoverageHistoryEntry,
  ProjectCoverageMetric,
  ProjectCoverageSummary,
  ProjectCoverageTotals,
} from './coverage.js';

export type {
  DatabaseReachability,
  DatabaseRestoreResult,
  DatabaseServiceAction,
  MachineDatabaseDriver,
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
  MachineDatabaseExplorerDriver,
  MachineDatabaseConnection,
  MachineDatabaseCatalogItem,
  MachineDatabaseTable,
  MachineDatabaseQueryResult,
  DatabaseSnapshot,
  DatabaseSnapshotConfirmation,
  DatabaseSnapshotDriver,
  DatabaseSnapshotList,
  ProjectDatabaseEnvironment,
  ProjectDatabaseOverview,
  ProjectDatabaseSecret,
  ProjectDatabaseServiceActionResult,
  ProjectDatabaseSource,
} from './database.js';

export type {
  BundlerCheckResult,
  BundlerOutdatedGem,
  BundlerOverview,
} from './bundler.js';

export type {
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorFieldType,
  RailsGeneratorKind,
  RailsGeneratorResult,
  RailsMigrationDetail,
  RailsMigrationEntry,
  RailsMigrationMutationOperation,
  RailsMigrationStatus,
  RailsMigrationsOverview,
  RailsModelsOverview,
  RailsRouteEntry,
  RailsRoutesOverview,
  RailsSchemaColumn,
  RailsSchemaForeignKey,
  RailsSchemaIndex,
  RailsSchemaTable,
} from './rails.js';

export type {
  RailsCredentialsEnvironmentStatus,
  RailsCredentialsKeySource,
  RailsCredentialsOverview,
  RailsWorkerId,
  RailsWorkerOverview,
} from './rails-runtime.js';

export type {
  ProjectScript,
  ProjectScriptCatalog,
  ProjectScriptOrigin,
  ProjectScriptRisk,
  ProjectScriptVariable,
  ScriptExecution,
  ScriptExecutionHistory,
  ScriptExecutionEvent,
  ScriptExecutionConfirmation,
  ScriptExecutionLog,
  ScriptExecutionStatus,
  ScriptExecutionVariables,
} from './script.js';

export type {
  CreateEnvironmentProfileInput,
  EnvironmentProfile,
  EnvironmentProfileLimits,
  EnvironmentProfileList,
  EnvironmentProfileVariable,
  UpdateEnvironmentProfileInput,
} from './environment-profile.js';

export type {
  ProjectEnvironmentBaselineStatus,
  ProjectEnvironmentContract,
  ProjectEnvironmentContractAction,
  ProjectEnvironmentContractScope,
  ProjectEnvironmentContractSection,
  ProjectEnvironmentContractVariable,
  ProjectEnvironmentContractVariableStatus,
  ProjectEnvironmentFile,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariable,
  ProjectEnvironmentVariableValue,
} from './project-environment.js';

export type {
  ProjectChangeImpact,
  ProjectChangeImpactAction,
  ProjectChangeImpactCategory,
} from './project-change-impact.js';

export type {
  ProjectTerminalConfirmation,
  ProjectTerminalKind,
  ProjectTerminalStatus,
} from './terminal.js';
