import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './project-dependencies-typography.css';
import './database-layout-polish.css';
import './scripts-explorer-redesign.css';
import './log-visual-enhancer.css';
import './test-log-visual-polish.css';
import './test-log-theme-fix.css';
import './test-log-inspector.css';
import './log-detail-enhancer.css';
import './log-stream-syntax.css';
import './git-modern-polish.css';
import './git-summary-history-enhancer.css';
import './git-inline-file-diff-enhancer.css';
import './git-inline-diff-theme.css';
import './git-action-feedback.css';
import './git-diff-compact-enhancer.css';
import './git-diff-layout-fix.css';
import './git-diff-github-theme.css';
import './git-syntax-highlight.css';
import { installGitActionFeedback } from './git-action-feedback';
import { installGitDiffHeaderCleanup } from './git-diff-header-cleanup';
import { installGitDiffSyntaxEnhancer } from './git-diff-syntax-enhancer';
import { installGitIconEnhancer } from './git-icon-enhancer';
import { installGitInlineFileDiffEnhancer } from './git-inline-file-diff-enhancer';
import { installGitSummaryCurrentBranchHistory } from './git-summary-current-branch-history';
import { installGitSummaryGlobalSearchFix } from './git-summary-global-search-fix';
import { installGitSummaryHistoryEnhancer } from './git-summary-history-enhancer';
import { installGitSummaryInlineDiffFix } from './git-summary-inline-diff-fix';
import { installLogDetailEnhancer } from './log-detail-enhancer';
import { installLogVisualEnhancer } from './log-visual-enhancer';
import { installTestLogAutoFollow } from './test-log-auto-follow';
import { installTestLogInspector } from './test-log-inspector';
import { installTestLogInspectorMutationGuard } from './test-log-inspector-mutation-guard';
import { installTestLogToneEnhancer } from './test-log-tone-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installGitIconEnhancer();
installGitActionFeedback();
installGitSummaryCurrentBranchHistory();
installGitSummaryHistoryEnhancer();
installGitSummaryGlobalSearchFix();
installGitInlineFileDiffEnhancer();
installGitDiffSyntaxEnhancer();
installGitDiffHeaderCleanup();
installGitSummaryInlineDiffFix();
installLogVisualEnhancer();
installTestLogAutoFollow();
installTestLogToneEnhancer();
const restoreTestLogInspectorMutationObserver = installTestLogInspectorMutationGuard();
try {
  installTestLogInspector();
} finally {
  restoreTestLogInspectorMutationObserver();
}
installLogDetailEnhancer();

createApp(App)
  .use(router)
  .mount('#app');
