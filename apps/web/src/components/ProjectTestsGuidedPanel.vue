<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import type { Project } from '@dev-dashboard/contracts';

import { useProjectTestsPanel } from '../composables/useProjectTestsPanel';
import { exportLogSnapshot } from '../utils/log-export';
import Card from './Card.vue';
import ProjectCoveragePanel from './ProjectCoveragePanel.vue';
import ProjectLogExperience from './ProjectLogExperience.vue';
import ProjectTestFailureNavigator from './ProjectTestFailureNavigator.vue';

const props = defineProps<{ project: Project }>();
const {
  canExecuteSelection,
  caseLineInvalid,
  cleanLogContent,
  copyMessage,
  currentCommandText,
  currentRunner,
  currentStatusTone,
  currentTarget,
  duration,
  errorMessage,
  executionChoices,
  executionPreview,
  fileErrorMessage,
  formatTimestamp,
  handleClearLogs,
  handleCopyLogs,
  handleExecutionChoiceChange,
  handleExecuteSelection,
  handleRepeat,
  handleRepeatFile,
  handleStop,
  isRunning,
  loadOverview,
  loadingFilesCommandId,
  loadingOverview,
  loadingRelatedCommandId,
  logSnapshot,
  logTruncated,
  managedProcess,
  overview,
  relatedErrorMessage,
  relatedTests,
  runSummary,
  selectedCaseLine,
  selectedChoice,
  selectedExecutionKey,
  selectedFilePath,
  selectedNamePattern,
  selectionConfigured,
  startingCommandId,
  statusLabel,
  stopping,
  supportsCaseTarget,
  supportsNamePatternTarget,
  testFiles,
  totalTests,
} = useProjectTestsPanel(props);

function statusIconForTone(
  tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral',
) {
  if (tone === 'success') return CheckCircleIcon;
  if (tone === 'danger') return XCircleIcon;
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'info') return ClockIcon;
  return InformationCircleIcon;
}

function handleExportLog(): void {
  const snapshot = logSnapshot.value;
  if (!snapshot) return;

  exportLogSnapshot({
    projectName: props.project.name,
    origin: 'testes',
    identifier: snapshot.processId,
    capturedAt: snapshot.readAt,
    snapshot,
  });
}
</script>

<template src="./ProjectTestsGuidedPanel.template.html"></template>

<style scoped src="../project-tests-redesign.css"></style>
