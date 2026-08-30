import { ref } from 'vue';

import type {
  DatabaseServiceAction,
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
} from '@dev-dashboard/contracts';

import {
  fetchMachineDatabaseServices,
  fetchMachineDatabaseServiceDetails,
  installMachineDatabaseService,
  runMachineDatabaseServiceAction,
  uninstallMachineDatabaseService,
} from '../api/rails';
import { confirmDialog } from '../stores/app-dialog';

type PendingDatabaseServiceAction = {
  serviceId: string;
  action: DatabaseServiceAction | 'install' | 'uninstall';
} | null;

type LoadServicesResult = 'applied' | 'failed' | 'superseded';

type MachineDatabaseServicesDependencies = {
  fetchServices: typeof fetchMachineDatabaseServices;
  fetchDetails: typeof fetchMachineDatabaseServiceDetails;
  runAction: typeof runMachineDatabaseServiceAction;
  install: typeof installMachineDatabaseService;
  uninstall: typeof uninstallMachineDatabaseService;
  confirmMutation: typeof confirmDialog;
};

interface UseMachineDatabaseServicesOptions {
  dependencies?: Partial<MachineDatabaseServicesDependencies>;
}

const defaultDependencies: MachineDatabaseServicesDependencies = {
  fetchServices: fetchMachineDatabaseServices,
  fetchDetails: fetchMachineDatabaseServiceDetails,
  runAction: runMachineDatabaseServiceAction,
  install: installMachineDatabaseService,
  uninstall: uninstallMachineDatabaseService,
  confirmMutation: confirmDialog,
};

function actionPastLabel(
  action: DatabaseServiceAction | 'install' | 'uninstall',
): string {
  return {
    start: 'iniciado',
    stop: 'parado',
    restart: 'reiniciado',
    install: 'instalado',
    uninstall: 'desinstalado',
  }[action];
}

export function useMachineDatabaseServices(
  options: UseMachineDatabaseServicesOptions = {},
) {
  const dependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };

  const services = ref<MachineDatabaseService[]>([]);
  const loading = ref(true);
  const errorMessage = ref('');
  const successMessage = ref('');
  const lastUpdatedAt = ref<Date | null>(null);
  const expandedServiceId = ref<string | null>(null);
  const details = ref<Record<string, MachineDatabaseServiceDetails>>({});
  const detailsErrors = ref<Record<string, string>>({});
  const detailsLoading = ref<string | null>(null);
  const pending = ref<PendingDatabaseServiceAction>(null);

  let servicesGeneration = 0;
  const detailsGeneration = new Map<string, number>();

  async function loadServices(
    loadOptions: { clearSuccess?: boolean } = {},
  ): Promise<LoadServicesResult> {
    const generation = ++servicesGeneration;
    loading.value = true;
    errorMessage.value = '';
    if (loadOptions.clearSuccess) successMessage.value = '';

    try {
      const nextServices = await dependencies.fetchServices();
      if (generation !== servicesGeneration) return 'superseded';
      services.value = nextServices;
      lastUpdatedAt.value = new Date();
      return 'applied';
    } catch (error) {
      if (generation !== servicesGeneration) return 'superseded';
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os serviços do sistema.';
      return 'failed';
    } finally {
      if (generation === servicesGeneration) loading.value = false;
    }
  }

  function refreshServices(): void {
    void loadServices({ clearSuccess: true });
  }

  async function loadDetails(serviceId: string): Promise<void> {
    const generation = (detailsGeneration.get(serviceId) ?? 0) + 1;
    detailsGeneration.set(serviceId, generation);
    detailsLoading.value = serviceId;
    detailsErrors.value = { ...detailsErrors.value, [serviceId]: '' };

    try {
      const nextDetails = await dependencies.fetchDetails(serviceId);
      if (detailsGeneration.get(serviceId) !== generation) return;
      details.value = { ...details.value, [serviceId]: nextDetails };
    } catch (error) {
      if (detailsGeneration.get(serviceId) !== generation) return;
      detailsErrors.value = {
        ...detailsErrors.value,
        [serviceId]:
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar os detalhes do serviço.',
      };
    } finally {
      if (
        detailsGeneration.get(serviceId) === generation &&
        detailsLoading.value === serviceId
      ) {
        detailsLoading.value = null;
      }
    }
  }

  async function toggleDetails(serviceId: string): Promise<void> {
    if (expandedServiceId.value === serviceId) {
      expandedServiceId.value = null;
      return;
    }
    expandedServiceId.value = serviceId;
    if (!details.value[serviceId]) await loadDetails(serviceId);
  }

  async function refreshAfterMutation(
    service: MachineDatabaseService,
    action: DatabaseServiceAction | 'install' | 'uninstall',
  ): Promise<void> {
    const result = await loadServices();
    if (result === 'superseded') return;
    if (result === 'applied') {
      successMessage.value = `${service.label} ${actionPastLabel(action)} com sucesso.`;
      details.value = {};
      detailsGeneration.clear();
      return;
    }
    if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi ${actionPastLabel(action)}, mas não foi possível atualizar o status.`;
    }
  }

  async function runAction(
    service: MachineDatabaseService,
    action: DatabaseServiceAction,
  ): Promise<void> {
    if (!service.installed || pending.value) return;

    if (action === 'stop' || action === 'restart') {
      const verb = action === 'stop' ? 'parar' : 'reiniciar';
      const confirmed = await dependencies.confirmMutation({
        title: `${action === 'stop' ? 'Parar' : 'Reiniciar'} ${service.label}?`,
        message: `O serviço ${service.label} será ${verb}. Aplicações que dependem dele podem ficar indisponíveis durante a operação.`,
        confirmLabel:
          action === 'stop' ? 'Parar serviço' : 'Reiniciar serviço',
        tone: 'warning',
      });
      if (!confirmed) return;
    }

    pending.value = { serviceId: service.id, action };
    errorMessage.value = '';
    successMessage.value = '';
    try {
      await dependencies.runAction(service.id, action);
      await refreshAfterMutation(service, action);
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar o serviço do sistema.';
    } finally {
      pending.value = null;
    }
  }

  async function installService(service: MachineDatabaseService): Promise<void> {
    if (service.installed || pending.value) return;
    const confirmed = await dependencies.confirmMutation({
      title: `Instalar ${service.label}?`,
      message: `A instalação de ${service.label} altera os pacotes do sistema e pode solicitar sua senha.`,
      confirmLabel: 'Instalar serviço',
      tone: 'warning',
    });
    if (!confirmed) return;

    pending.value = { serviceId: service.id, action: 'install' };
    errorMessage.value = '';
    successMessage.value = '';
    try {
      await dependencies.install(service.id);
      await refreshAfterMutation(service, 'install');
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível instalar o serviço do sistema.';
    } finally {
      pending.value = null;
    }
  }

  async function uninstallService(
    service: MachineDatabaseService,
  ): Promise<void> {
    if (!service.installed || pending.value) return;
    const confirmed = await dependencies.confirmMutation({
      title: `Desinstalar ${service.label}?`,
      message: `O pacote de ${service.label} será removido do sistema. Os dados do banco podem permanecer no disco e o serviço ficará indisponível.`,
      confirmLabel: 'Desinstalar serviço',
      tone: 'danger',
    });
    if (!confirmed) return;

    pending.value = { serviceId: service.id, action: 'uninstall' };
    errorMessage.value = '';
    successMessage.value = '';
    try {
      await dependencies.uninstall(service.id);
      await refreshAfterMutation(service, 'uninstall');
    } catch (error) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível desinstalar o serviço do sistema.';
    } finally {
      pending.value = null;
    }
  }

  return {
    services,
    loading,
    errorMessage,
    successMessage,
    lastUpdatedAt,
    expandedServiceId,
    details,
    detailsErrors,
    detailsLoading,
    pending,
    loadServices,
    refreshServices,
    loadDetails,
    toggleDetails,
    runAction,
    installService,
    uninstallService,
  };
}
