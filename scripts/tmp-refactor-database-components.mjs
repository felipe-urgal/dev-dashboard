import { readFileSync, writeFileSync } from 'node:fs';

const viewPath = 'apps/web/src/views/DatabaseView.vue';
const docsPath = 'docs/architecture/database-explorer.md';

let view = readFileSync(viewPath, 'utf8');

function replaceView(search, replacement, label) {
  const next = view.replace(search, replacement);
  if (next === view) throw new Error(`DatabaseView drift: ${label}`);
  view = next;
}

replaceView(
  "import { computed, onMounted, ref } from 'vue';",
  "import { onMounted, ref } from 'vue';",
  'vue imports',
);

replaceView(
  `import {\n  ArrowPathIcon,\n  ChevronDownIcon,\n  ChevronUpIcon,\n  CircleStackIcon,\n  InformationCircleIcon,\n  LinkIcon,\n  MagnifyingGlassIcon,\n  PauseIcon,\n  PlayIcon,\n  TrashIcon,\n} from '@heroicons/vue/24/outline';`,
  `import {\n  ChevronDownIcon,\n  CircleStackIcon,\n  LinkIcon,\n  MagnifyingGlassIcon,\n} from '@heroicons/vue/24/outline';`,
  'icon imports',
);

replaceView(
  `import DatabaseExplorerSidebar from '../components/database/DatabaseExplorerSidebar.vue';\nimport DatabaseQueryEditor from '../components/database/DatabaseQueryEditor.vue';\nimport DatabaseResultTable from '../components/database/DatabaseResultTable.vue';`,
  `import DatabaseConnectionDialog from '../components/database/DatabaseConnectionDialog.vue';\nimport DatabaseExplorerSidebar from '../components/database/DatabaseExplorerSidebar.vue';\nimport DatabaseQueryEditor from '../components/database/DatabaseQueryEditor.vue';\nimport DatabaseResultTable from '../components/database/DatabaseResultTable.vue';\nimport DatabaseServicesPanel from '../components/database/DatabaseServicesPanel.vue';`,
  'database component imports',
);

replaceView(
  `const installedServices = computed(() =>\n  services.value.filter((service) => service.installed),\n);\nconst uninstalledServices = computed(() =>\n  services.value.filter((service) => !service.installed),\n);\nconst activeServices = computed(() =>\n  installedServices.value.filter((service) => service.active),\n);\n`,
  '',
  'service computed state',
);

replaceView(
  `function applySavedConnection(event: Event): void {\n  const id = (event.target as HTMLSelectElement).value;\n  const saved = selectSavedConnection(id);`,
  `function applySavedConnection(id: string): void {\n  const saved = selectSavedConnection(id);`,
  'saved connection event adapter',
);

replaceView(
  `function syncExplorerPort(): void {\n  explorerDraft.value = {\n    ...explorerDraft.value,\n    port: explorerDraft.value.driver === 'postgresql' ? 5432 : 3306,\n  };\n}`,
  `function updateExplorerDraft(draft: MachineDatabaseConnection): void {\n  explorerDraft.value = draft;\n}\n\nfunction syncExplorerPort(\n  driver: MachineDatabaseConnection['driver'],\n): void {\n  explorerDraft.value = {\n    ...explorerDraft.value,\n    driver,\n    port: driver === 'postgresql' ? 5432 : 3306,\n  };\n}`,
  'connection draft adapters',
);

replaceView(
  `function serviceDetails(\n  serviceId: string,\n): MachineDatabaseServiceDetails | undefined {\n  return details.value[serviceId];\n}\n\nfunction reachabilityLabel(\n  value: MachineDatabaseServiceDetails['reachability'],\n) {\n  return {\n    reachable: 'Porta acessível',\n    unreachable: 'Porta indisponível',\n    unknown: 'Não testada',\n  }[value];\n}\n\n`,
  '',
  'service presentation helpers',
);

replaceView(
  `function isPending(\n  service: MachineDatabaseService,\n  action: DatabaseServiceAction | 'install' | 'uninstall',\n) {\n  return (\n    pending.value?.serviceId === service.id && pending.value?.action === action\n  );\n}\n\n`,
  '',
  'pending presentation helper',
);

const servicesStart = view.indexOf('    <header class="database-machine-header">');
const explorerStart = view.indexOf(
  '      <section\n        class="database-explorer"',
  servicesStart,
);
if (servicesStart < 0 || explorerStart < 0) {
  throw new Error('DatabaseView drift: services/explorer template boundaries');
}

const servicesComponent = `    <DatabaseServicesPanel\n      :services="services"\n      :loading="loading"\n      :error-message="errorMessage"\n      :success-message="successMessage"\n      :last-updated-at="lastUpdatedAt"\n      :expanded-service-id="expandedServiceId"\n      :details="details"\n      :details-errors="detailsErrors"\n      :details-loading="detailsLoading"\n      :pending="pending"\n      @refresh="refreshServices"\n      @run-action="runAction"\n      @toggle-details="toggleDetails"\n      @reload-details="loadDetails"\n      @install="installService"\n      @uninstall="uninstallService"\n    />\n`;
view = view.slice(0, servicesStart) + servicesComponent + view.slice(explorerStart);

replaceView(
  `      <section\n        class="database-explorer"`,
  `      <section\n        v-if="!loading || services.length > 0"\n        class="database-explorer"`,
  'explorer initial loading visibility',
);

replaceView(
  `      </section>\n    </template>\n  </section>\n  <div\n    v-if="explorerModalOpen"`,
  `      </section>\n  </section>\n  <div\n    v-if="explorerModalOpen"`,
  'removed services v-else wrapper',
);

const modalStart = view.indexOf('  <div\n    v-if="explorerModalOpen"');
const templateEnd = view.indexOf('\n</template>\n\n<style', modalStart);
if (modalStart < 0 || templateEnd < 0) {
  throw new Error('DatabaseView drift: connection dialog boundaries');
}

const dialogComponent = `  <DatabaseConnectionDialog\n    :open="explorerModalOpen"\n    :draft="explorerDraft"\n    :saved-connections="savedConnections"\n    :selected-saved-connection-id="selectedSavedConnectionId"\n    :loading="explorerLoading"\n    :error="explorerError"\n    :test-message="explorerTestMessage"\n    @close="closeExplorerConnection"\n    @update:draft="updateExplorerDraft"\n    @update-driver="syncExplorerPort"\n    @select-saved="applySavedConnection"\n    @remove-saved="removeSavedConnection"\n    @save="saveExplorerConnection"\n    @test="testExplorerConnection"\n    @connect="connectExplorer"\n  />`;
view = view.slice(0, modalStart) + dialogComponent + view.slice(templateEnd);

writeFileSync(viewPath, view);

let docs = readFileSync(docsPath, 'utf8');

function replaceDocs(search, replacement, label) {
  const next = docs.replace(search, replacement);
  if (next === docs) throw new Error(`database-explorer.md drift: ${label}`);
  docs = next;
}

replaceDocs(
  `- \`DatabaseQueryEditor.vue\` preserva editor, histórico e o atalho \`Ctrl/Cmd + Enter\`, emitindo apenas intenções para a view.`,
  `- \`DatabaseQueryEditor.vue\` preserva editor, histórico e o atalho \`Ctrl/Cmd + Enter\`, emitindo apenas intenções para a view;\n- \`DatabaseServicesPanel.vue\` renderiza resumo, cards, detalhes e ações dos serviços da máquina, emitindo as intenções de refresh/start/stop/restart/install/uninstall para a view;\n- \`DatabaseConnectionDialog.vue\` renderiza o formulário de conexão e conexões salvas, mantendo teste, conexão, persistência e seleção efetiva sob responsabilidade da view/composables.`,
  'visual component list',
);

replaceDocs(
  `A próxima etapa de frontend continua a decomposição visual com \`DatabaseServicesPanel\` e \`DatabaseConnectionDialog\`, mantendo a orquestração na \`DatabaseView\`; o primitive de storage versionado permanece em recorte posterior.`,
  `A decomposição visual principal agora inclui \`DatabaseServicesPanel\` e \`DatabaseConnectionDialog\` sem mover requests para os filhos. O próximo recorte de frontend deve retirar da \`DatabaseView\` a orquestração remanescente de serviços e execução para composables próprios (\`useMachineDatabaseServices\` e \`useDatabaseQueryExecution\`); o primitive de storage versionado permanece em recorte posterior.`,
  'next frontend step',
);

writeFileSync(docsPath, docs);
