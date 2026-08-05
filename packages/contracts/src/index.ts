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
  ProjectServerHealth,
  ProjectServerSettings,
  ServerHealthStatus,
  UpdateProjectServerSettingsInput,
} from './server.js';

export type { Job, JobStatus } from './job.js';

export type {
  GitBranch,
  GitBranchKind,
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
  GitStashEntry,
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from './git.js';

export type {
  GitStashConfirmation,
  GitStashCreateInput,
  GitStashDetail,
  GitStashFile,
  GitStashMutationResult,
  GitStashOperation,
  GitStashSummary,
} from './git-stash.js';

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
  ProjectTestCommand,
  ProjectTestFile,
  ProjectTestOrigin,
  ProjectTestOverview,
  ProjectTestRunner,
  TestExecutionEvent,
  TestExecutionHistory,
  TestExecutionRecord,
  TestExecutionStatus,
} from './test.js';

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