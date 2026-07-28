import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './log-visual-enhancer.css';
import './sql-explanation-enhancer.css';
import { installLogVisualEnhancer } from './log-visual-enhancer';
import { installSqlExplanationEnhancer } from './sql-explanation-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installLogVisualEnhancer();
installSqlExplanationEnhancer();

createApp(App)
  .use(router)
  .mount('#app');