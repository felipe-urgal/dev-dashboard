import {
  createApp,
} from 'vue';

import App from './App.vue';
import { router } from './router';
import './styles.css';
import { loadVisualPreferences } from './utils/visual-preferences';

loadVisualPreferences();

createApp(App)
  .use(router)
  .mount('#app');
