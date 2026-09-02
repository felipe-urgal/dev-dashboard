import { createApp } from 'vue';
import 'vue-sonner/style.css';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './project-dependencies-typography.css';
import './database-layout-polish.css';
import './scripts-explorer-redesign.css';
import './test-log-visual-polish.css';
import './test-log-theme-fix.css';
import './test-log-inspector.css';
import './git-modern-polish.css';
import './git-inline-diff-theme.css';
import './git-diff-compact-enhancer.css';
import './git-diff-layout-fix.css';
import './git-diff-github-theme.css';
import './git-syntax-highlight.css';
import './sidebar-collapse.css';
import './shell-option3.css';
import { installTestLogAutoFollow } from './test-log-auto-follow';
import { installTestLogInspector } from './test-log-inspector';
import { installTestLogInspectorMutationGuard } from './test-log-inspector-mutation-guard';
import { installTestLogToneEnhancer } from './test-log-tone-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installTestLogAutoFollow();
installTestLogToneEnhancer();
const restoreTestLogInspectorMutationObserver =
  installTestLogInspectorMutationGuard();
try {
  installTestLogInspector();
} finally {
  restoreTestLogInspectorMutationObserver();
}

createApp(App).use(router).mount('#app');
