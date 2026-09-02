import { createApp } from 'vue';
import 'vue-sonner/style.css';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './project-dependencies-typography.css';
import './database-layout-polish.css';
import './scripts-explorer-redesign.css';
import './git-modern-polish.css';
import './git-inline-diff-theme.css';
import './git-diff-compact-enhancer.css';
import './git-diff-layout-fix.css';
import './git-diff-github-theme.css';
import './git-syntax-highlight.css';
import './sidebar-collapse.css';
import './shell-option3.css';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();

createApp(App).use(router).mount('#app');
