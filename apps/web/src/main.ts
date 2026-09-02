import { createApp } from 'vue';
import 'vue-sonner/style.css';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './styles/features/project-details-redesign.css';
import './styles/features/project-dependencies-typography.css';
import './styles/features/database-layout-polish.css';
import './styles/features/scripts-explorer-redesign.css';
import './styles/features/git-modern-polish.css';
import './styles/features/git-inline-diff-theme.css';
import './styles/features/git-diff-compact-enhancer.css';
import './styles/features/git-diff-layout-fix.css';
import './styles/features/git-diff-github-theme.css';
import './styles/features/git-syntax-highlight.css';
import './styles/features/sidebar-collapse.css';
import './styles/features/shell-option3.css';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();

createApp(App).use(router).mount('#app');
