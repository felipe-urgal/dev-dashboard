import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './project-header-server-enhancer.css';
import './log-visual-enhancer.css';
import './sql-explanation-enhancer.css';
import './log-detail-enhancer.css';
import './git-modern-polish.css';
import './git-summary-history-enhancer.css';
import './git-commit-enhancer.css';
import { installGitCommitEnhancer } from './git-commit-enhancer';
import { installGitIconEnhancer } from './git-icon-enhancer';
import { installGitSummaryHistoryEnhancer } from './git-summary-history-enhancer';
import { installLogDetailEnhancer } from './log-detail-enhancer';
import { installLogVisualEnhancer } from './log-visual-enhancer';
import { installProjectHeaderServerEnhancer } from './project-header-server-enhancer';
import { installSqlExplanationEnhancer } from './sql-explanation-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installProjectHeaderServerEnhancer();
installGitIconEnhancer();
installGitSummaryHistoryEnhancer();
installGitCommitEnhancer();
installLogVisualEnhancer();
installSqlExplanationEnhancer();
installLogDetailEnhancer();

createApp(App)
  .use(router)
  .mount('#app');