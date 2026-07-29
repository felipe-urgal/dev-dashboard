import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './project-header-server-enhancer.css';
import './log-visual-enhancer.css';
import './test-log-visual-polish.css';
import './sql-explanation-enhancer.css';
import './log-detail-enhancer.css';
import './git-modern-polish.css';
import './git-summary-history-enhancer.css';
import './git-history-pagination.css';
import './git-commit-enhancer.css';
import './git-stash-enhancer.css';
import './git-history-page-enhancer.css';
import './git-inline-file-diff-enhancer.css';
import './git-inline-diff-theme.css';
import './git-history-compact-columns.css';
import './git-action-feedback.css';
import './git-branch-delete-enhancer.css';
import './git-diff-compact-enhancer.css';
import './git-diff-layout-fix.css';
import { installGitActionFeedback } from './git-action-feedback';
import { installGitBranchDeleteEnhancer } from './git-branch-delete-enhancer';
import { installGitCommitEnhancer } from './git-commit-enhancer';
import { installGitDiffCompactEnhancer } from './git-diff-compact-enhancer';
import { installGitDiffPageEnhancer } from './git-diff-page-enhancer';
import { installGitHistoryGlobalSearchFix } from './git-history-global-search-fix';
import { installGitHistoryInlineDiffFix } from './git-history-inline-diff-fix';
import { installGitHistoryPageEnhancer } from './git-history-page-enhancer';
import { installGitIconEnhancer } from './git-icon-enhancer';
import { installGitInlineFileDiffEnhancer } from './git-inline-file-diff-enhancer';
import { installGitStashEnhancer } from './git-stash-enhancer';
import { installGitSummaryHistoryEnhancer } from './git-summary-history-enhancer';
import { installGitSummaryInlineDiffFix } from './git-summary-inline-diff-fix';
import { installLogDetailEnhancer } from './log-detail-enhancer';
import { installLogVisualEnhancer } from './log-visual-enhancer';
import { installProjectHeaderServerEnhancer } from './project-header-server-enhancer';
import { installSqlExplanationEnhancer } from './sql-explanation-enhancer';
import { installTestLogToneEnhancer } from './test-log-tone-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installProjectHeaderServerEnhancer();
installGitIconEnhancer();
installGitActionFeedback();
installGitBranchDeleteEnhancer();
installGitSummaryHistoryEnhancer();
installGitCommitEnhancer();
installGitStashEnhancer();
installGitDiffPageEnhancer();
installGitDiffCompactEnhancer();
installGitHistoryPageEnhancer();
installGitHistoryGlobalSearchFix();
installGitInlineFileDiffEnhancer();
installGitHistoryInlineDiffFix();
installGitSummaryInlineDiffFix();
installLogVisualEnhancer();
installTestLogToneEnhancer();
installSqlExplanationEnhancer();
installLogDetailEnhancer();

createApp(App)
  .use(router)
  .mount('#app');
