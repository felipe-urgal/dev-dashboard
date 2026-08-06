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
  ProjectEditor,
  ProjectEditorAvailability,
  ProjectEditorId,
  ProjectEditorLaunchResult,
} from './editor.js';

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
  ProjectFileWriteRequest,
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
  AiCapability,
  AiChatMessage,
  AiChatRequest,
  AiChatRole,
  AiChatStreamEvent,
  AiCompletionRequest,
  AiCompletionResult,
  AiModelInfo,
  AiTool,
  ProjectAiStatus,
} from './ai-assistant.js';

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
  ProjectCoverageTotals,
} from './coverage.js';

export type {
  DatabaseReachability,
  DatabaseRestoreResult,
  DatabaseServiceAction,
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
  RailsMigrationMutationConfirmation,
  RailsMigrationMutationOperation,
  RailsMigrationMutationResult,
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
  Activity,
  ActivityBase,
  ActivityList,
  ActivityOrigin,
  ActivityStatus,
  ActivitySummary,
  ProcessActivityReference,
  ScriptActivity,
  ScriptActivityReference,
  ServerActivity,
  TestActivity,
} from './activity.js';

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
