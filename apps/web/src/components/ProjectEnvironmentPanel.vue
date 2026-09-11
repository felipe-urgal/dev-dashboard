<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import type {
  Project,
  ProjectEnvironmentContractScope,
  ProjectEnvironmentContractVariable,
} from '@dev-dashboard/contracts';

import { useProjectEnvironmentContract } from '../composables/useProjectEnvironmentContract';
import { useProjectEnvironmentVariables } from '../composables/useProjectEnvironmentVariables';
import LoadingSkeleton from './LoadingSkeleton.vue';
import ProjectEnvironmentContractSummary from './ProjectEnvironmentContractSummary.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const environment = useProjectEnvironmentVariables(() => props.project);
const contract = useProjectEnvironmentContract(() => props.project);
const selectedFileName = ref('');

const actionableStatuses = new Set<
  ProjectEnvironmentContractVariable['status']
>(['missing', 'undocumented', 'duplicate', 'conflicting-source', 'unknown']);

const scopeLabels: Record<ProjectEnvironmentContractScope, string> = {
  default: 'Padrão',
  test: 'Teste',
  production: 'Produção',
  docker: 'Docker',
};

const statusLabels: Record<
  ProjectEnvironmentContractVariable['status'],
  string
> = {
  present: 'Presente',
  missing: 'Ausente',
  undocumented: 'Não documentada',
  duplicate: 'Duplicada',
  'conflicting-source': 'Fonte conflitante',
  optional: 'Opcional',
  unknown: 'Revisar',
};

const actionCopy: Record<
  ProjectEnvironmentContractVariable['suggestedAction'],
  string
> = {
  none: '',
  configure: 'Configurar neste ambiente.',
  document: 'Adicionar ao baseline quando fizer sentido.',
  'review-source': 'Revisar os arquivos de origem.',
  'choose-baseline': 'Escolher um baseline confiável.',
};

const files = computed(() => environment.overview.value?.files ?? []);

const selectedFile = computed(
  () =>
    files.value.find((file) => file.file === selectedFileName.value) ??
    files.value[0] ??
    null,
);

watch(
  files,
  (currentFiles) => {
    if (
      selectedFileName.value &&
      currentFiles.some((file) => file.file === selectedFileName.value)
    ) {
      return;
    }
    selectedFileName.value = currentFiles[0]?.file ?? '';
  },
  { immediate: true },
);

watch(environment.errorMessage, (value) => {
  if (!value) return;
  toast.error('Não foi possível concluir a ação.', { description: value });
});

function secretCount(file: (typeof files.value)[number]): number {
  return file.variables.filter((variable) => variable.sensitive).length;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const issueCount = computed(() =>
  (contract.contract.value?.sections ?? []).reduce(
    (total, section) =>
      total +
      section.variables.filter((variable) =>
        actionableStatuses.has(variable.status),
      ).length +
      Number(section.baselineStatus !== 'resolved'),
    0,
  ),
);

const stateSummary = computed(() => {
  if (contract.loading.value && !contract.contract.value) {
    return {
      label: 'Verificando',
      detail: 'comparando ambientes',
      tone: 'loading',
    };
  }
  if (contract.errorMessage.value && !contract.contract.value) {
    return {
      label: 'Parcial',
      detail: 'contrato indisponível',
      tone: 'partial',
    };
  }
  if (issueCount.value > 0) {
    return {
      label: 'Atenção',
      detail: countLabel(
        issueCount.value,
        'pendência encontrada',
        'pendências encontradas',
      ),
      tone: 'warning',
    };
  }
  return {
    label: 'Consistente',
    detail: 'sem pendências estruturais',
    tone: 'success',
  };
});

const selectedFileKind = computed(() => {
  const file = selectedFile.value?.file;
  if (!file) return '';
  if (
    (contract.contract.value?.sections ?? []).some(
      (section) => section.baseline === file,
    )
  ) {
    return 'baseline';
  }
  if (/\.(?:example|sample)$/.test(file)) return 'template';
  return 'arquivo local';
});

const selectedBaselineLabel = computed(() => {
  const file = selectedFile.value?.file;
  if (!file) return '';

  const section = (contract.contract.value?.sections ?? []).find(
    (item) => item.sourceFiles.includes(file) || item.baseline === file,
  );
  if (!section) return '';
  if (section.baselineStatus === 'ambiguous') return 'baseline ambíguo';
  if (section.baselineStatus !== 'resolved' || !section.baseline) {
    return 'baseline ausente';
  }
  if (section.baseline === file) return 'baseline reconhecido';
  return `baseline ${section.baseline}`;
});

const selectedFileIssues = computed(() => {
  const file = selectedFile.value?.file;
  if (!file || !contract.contract.value) return [];

  const issues = new Map<
    string,
    {
      key: string;
      name: string;
      status: string;
      action: string;
      sensitive: boolean;
    }
  >();

  for (const section of contract.contract.value.sections) {
    const sectionMatches =
      section.sourceFiles.includes(file) ||
      section.baseline === file ||
      section.baselineCandidates.includes(file);
    if (!sectionMatches) continue;

    if (section.baselineStatus !== 'resolved') {
      const status =
        section.baselineStatus === 'ambiguous'
          ? 'Baseline ambíguo'
          : 'Baseline ausente';
      const key = `baseline:${section.scope}`;
      issues.set(key, {
        key,
        name: scopeLabels[section.scope],
        status,
        action: 'Escolher um baseline confiável.',
        sensitive: false,
      });
    }

    for (const variable of section.variables) {
      if (!actionableStatuses.has(variable.status)) continue;

      const belongsToFile =
        variable.status === 'missing'
          ? section.sourceFiles.includes(file) &&
            section.baseline !== file &&
            variable.baseline !== file
          : variable.status === 'unknown'
            ? variable.sources.includes(file) ||
              (section.sourceFiles.includes(file) && section.baseline !== file)
            : variable.sources.includes(file);
      if (!belongsToFile) continue;

      const key = `${section.scope}:${variable.name}:${variable.status}`;
      issues.set(key, {
        key,
        name: variable.name,
        status: statusLabels[variable.status],
        action: actionCopy[variable.suggestedAction],
        sensitive: variable.sensitive,
      });
    }
  }

  return [...issues.values()];
});
</script>

<template>
  <section
    class="project-environment-panel"
    :aria-busy="environment.loading.value || contract.loading.value"
  >
    <LoadingSkeleton
      v-if="environment.loading.value && !environment.overview.value"
      label="Carregando variáveis de ambiente…"
      :rows="3"
    />

    <template v-else-if="environment.overview.value">
      <section
        class="project-environment-summary"
        aria-label="Resumo do ambiente"
      >
        <article>
          <span>Estado</span>
          <strong :class="`is-${stateSummary.tone}`">
            {{ stateSummary.label }}
          </strong>
          <small>{{ stateSummary.detail }}</small>
        </article>

        <article>
          <span>Arquivo atual</span>
          <strong class="is-accent project-environment-current-file">
            {{ selectedFile?.file ?? '—' }}
          </strong>
          <small v-if="selectedFile">
            {{
              countLabel(selectedFile.variables.length, 'variável', 'variáveis')
            }}
            · {{ countLabel(secretCount(selectedFile), 'segredo', 'segredos') }}
          </small>
          <small v-else>Nenhum arquivo reconhecido</small>
        </article>

        <article>
          <span>Modo</span>
          <strong>Somente leitura</strong>
          <small>nenhuma edição nesta tela</small>
        </article>
      </section>

      <p
        v-if="environment.overview.value.files.length === 0"
        class="project-environment-empty"
      >
        Nenhum arquivo <code>.env</code> reconhecido foi encontrado neste
        projeto.
      </p>

      <div v-else class="project-environment-workspace">
        <aside
          class="project-environment-files"
          aria-label="Arquivos de ambiente"
        >
          <header>
            <strong>Arquivos</strong>
            <small>Selecione o contexto para inspecionar.</small>
          </header>

          <nav>
            <button
              v-for="file in files"
              :key="file.file"
              type="button"
              class="project-environment-file-button"
              :class="{ 'is-selected': selectedFile?.file === file.file }"
              :aria-current="
                selectedFile?.file === file.file ? 'true' : undefined
              "
              @click="selectedFileName = file.file"
            >
              <code>{{ file.file }}</code>
              <span>
                {{ countLabel(file.variables.length, 'variável', 'variáveis') }}
                <small>
                  {{ countLabel(secretCount(file), 'segredo', 'segredos') }}
                </small>
              </span>
            </button>
          </nav>

          <ProjectEnvironmentContractSummary
            :contract="contract.contract.value"
            :loading="contract.loading.value"
            :error-message="contract.errorMessage.value"
          />
        </aside>

        <section
          v-if="selectedFile"
          class="project-environment-inspector"
          :aria-label="`Arquivo ${selectedFile.file}`"
        >
          <header class="project-environment-inspector-header">
            <div>
              <strong>
                <code>{{ selectedFile.file }}</code>
              </strong>
              <span
                v-if="selectedFileKind"
                class="project-environment-file-kind"
                :class="`is-${selectedFileKind.replace(' ', '-')}`"
              >
                {{ selectedFileKind }}
              </span>
            </div>
            <small>
              {{
                countLabel(
                  selectedFile.variables.length,
                  'variável',
                  'variáveis',
                )
              }}
              ·
              {{ countLabel(secretCount(selectedFile), 'segredo', 'segredos') }}
              <template v-if="selectedBaselineLabel">
                · {{ selectedBaselineLabel }}
              </template>
            </small>
          </header>

          <section
            class="project-environment-file-consistency"
            aria-label="Consistência deste arquivo"
          >
            <h3>Consistência deste arquivo</h3>

            <p
              v-if="contract.loading.value && !contract.contract.value"
              class="project-environment-consistency-note"
            >
              Comparando este arquivo com o contrato…
            </p>
            <p
              v-else-if="
                contract.errorMessage.value && !contract.contract.value
              "
              class="project-environment-consistency-note is-warning"
            >
              O contrato não pôde ser carregado. As variáveis continuam
              disponíveis abaixo.
            </p>
            <p
              v-else-if="selectedFileIssues.length === 0"
              class="project-environment-consistency-note is-ok"
            >
              Nenhuma diferença estrutural relevante para este arquivo.
            </p>

            <div v-else class="project-environment-issue-list">
              <article v-for="issue in selectedFileIssues" :key="issue.key">
                <code>{{ issue.name }}</code>
                <strong>{{ issue.status }}</strong>
                <small v-if="issue.sensitive">sensível</small>
                <span v-if="issue.action">{{ issue.action }}</span>
              </article>
            </div>
          </section>

          <table class="project-environment-table">
            <thead class="project-environment-visually-hidden">
              <tr>
                <th scope="col">Variável</th>
                <th scope="col">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="variable in selectedFile.variables"
                :key="variable.name"
              >
                <th scope="row">
                  <code>{{ variable.name }}</code>
                </th>
                <td>
                  <div
                    v-if="variable.sensitive"
                    class="project-environment-sensitive-value"
                  >
                    <template
                      v-if="
                        environment.hasRevealedValue(
                          selectedFile.file,
                          variable.name,
                        )
                      "
                    >
                      <code
                        v-if="
                          environment.revealedValue(
                            selectedFile.file,
                            variable.name,
                          )
                        "
                        class="project-environment-secret-value"
                        >{{
                          environment.revealedValue(
                            selectedFile.file,
                            variable.name,
                          )
                        }}</code
                      >
                      <span v-else class="project-environment-empty-value">
                        vazio
                      </span>
                      <button
                        type="button"
                        class="secondary-button project-environment-value-action"
                        :aria-label="`Ocultar valor de ${variable.name}`"
                        @click="
                          environment.hideValue(
                            selectedFile.file,
                            variable.name,
                          )
                        "
                      >
                        <EyeSlashIcon aria-hidden="true" />
                        Ocultar
                      </button>
                    </template>
                    <template v-else>
                      <StatusBadge tone="warning">Segredo</StatusBadge>
                      <button
                        type="button"
                        class="secondary-button project-environment-value-action"
                        :disabled="
                          environment.isRevealingValue(
                            selectedFile.file,
                            variable.name,
                          )
                        "
                        :aria-label="`Exibir valor de ${variable.name}`"
                        @click="
                          environment.revealValue(
                            selectedFile.file,
                            variable.name,
                          )
                        "
                      >
                        <EyeIcon aria-hidden="true" />
                        {{
                          environment.isRevealingValue(
                            selectedFile.file,
                            variable.name,
                          )
                            ? 'Exibindo…'
                            : 'Exibir'
                        }}
                      </button>
                    </template>
                  </div>
                  <code v-else-if="variable.value">{{ variable.value }}</code>
                  <span v-else class="project-environment-empty-value">
                    vazio
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <p class="project-environment-footnote">
            Valores sensíveis são revelados individualmente e descartados ao
            sair da tela.
          </p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped src="./ProjectEnvironmentPanel.css"></style>
