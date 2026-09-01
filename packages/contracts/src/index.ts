export type { Workspace } from './workspace.js';

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
  LocalPortEntry,
  LocalPortExpectation,
  LocalPortExternalProcess,
  LocalPortInspection,
  LocalPortInspectionStatus,
  LocalPortManagedProcess,
  LocalPortScope,
  LocalPortState,
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
  TestExecutionStatus,
} from './test.js';

export type {
  ProjectCoverageFileSummary,
  ProjectCoverageHistory,
  ProjectCoverageHistoryEntry,
  ProjectCoverageMetric,
  ProjectCoverageSummary,
} from './coverage.js';

export type {
  RailsActionConfirmation,
  RailsActionKind,
  RailsActionResult,
  RailsDatabaseInfo,
  RailsGenerator,
  RailsGeneratorInfo,
  RailsMigration,
  RailsMigrationDirection,
  RailsMigrationResult,
  RailsRoute,
  RailsSchemaColumn,
  RailsSchemaForeignKey,
  RailsSchemaIndex,
  RailsSchemaTable,
} from './rails.js';

export type {
  RailsRuntimeAction,
  RailsRuntimeActionResult,
  RailsRuntimeActionTarget,
  RailsRuntimeState,
  RailsWorkerState,
} from './rails-runtime.js';

export type {
  ProjectScript,
  ProjectScriptExecution,
  ProjectScriptExecutionStatus,
  ProjectScriptExecutionSummary,
} from './script.js';

export type {
  BundlerInspection,
  BundlerKind,
  BundlerStatus,
} from './bundler.js';

export type {
  ProjectEnvironmentProfile,
  ProjectEnvironmentProfileSummary,
} from './environment-profile.js';

export type {
  ProjectEnvironmentVariable,
  ProjectEnvironmentVariableSource,
  ProjectEnvironmentVariables,
} from './project-environment.js';

export type {
  DatabaseAdapterCapability,
  DatabaseConnectionInput,
  DatabaseConnectionResult,
  DatabaseConnectionSummary,
  DatabaseConnectionTestResult,
  DatabaseDriver,
  DatabaseExplorerColumn,
  DatabaseExplorerError,
  DatabaseExplorerForeignKey,
  DatabaseExplorerIndex,
  DatabaseExplorerQuery,
  DatabaseExplorerQueryResult,
  DatabaseExplorerQueryRow,
  DatabaseExplorerSession,
  DatabaseExplorerSessionState,
  DatabaseExplorerTable,
  DatabaseExplorerTableDetails,
  DatabaseExplorerTableList,
  DatabaseOverview,
  DatabaseService,
  DatabaseServiceKind,
  DatabaseServiceState,
  DatabaseSnapshot,
  DatabaseSnapshotAdapter,
  DatabaseSnapshotState,
} from './database.js';

export type {
  ProjectChangeImpact,
  ProjectChangeImpactFile,
  ProjectChangeImpactRisk,
  ProjectChangeImpactSummary,
} from './project-change-impact.js';

export type {
  ProjectTerminalConfig,
  ProjectTerminalSession,
  ProjectTerminalState,
} from './terminal.js';
