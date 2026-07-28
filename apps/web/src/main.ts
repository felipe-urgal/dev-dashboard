import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import './project-details-redesign.css';
import './log-visual-enhancer.css';
import { installLogVisualEnhancer } from './log-visual-enhancer';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();
installLogVisualEnhancer();

createApp(App)
  .use(router)
  .mount('#app');