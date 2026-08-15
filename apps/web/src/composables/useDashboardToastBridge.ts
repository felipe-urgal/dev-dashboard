import { watch } from 'vue';
import { toast } from 'vue-sonner';

import { dashboardStore } from '../stores/dashboard';

/**
 * Converte os campos transitórios de mensagem da dashboardStore
 * (errorMessage/successMessage/warningCount) em toasts flutuantes (vue-sonner).
 * Deve ser instanciada uma única vez (App.vue) — a store é um singleton e
 * watchers duplicados gerariam toasts duplicados.
 */
export function useDashboardToastBridge(): void {
  const { errorMessage, successMessage, warningCount } = dashboardStore;

  watch(errorMessage, (value) => {
    if (!value) return;
    toast.error('Não foi possível concluir a ação.', { description: value });
    errorMessage.value = '';
  });

  watch(successMessage, (value) => {
    if (!value) return;
    toast.success('Ação concluída.', { description: value });
    successMessage.value = '';
  });

  watch(warningCount, (value) => {
    if (!value) return;
    toast.warning('Scan concluído com avisos.', {
      description: `${value} diretório(s) não puderam ser analisados.`,
    });
    warningCount.value = 0;
  });
}
