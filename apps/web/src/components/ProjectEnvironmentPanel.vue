<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';
import { watch } from 'vue';
import { toast } from 'vue-sonner';
import type { Project } from '@dev-dashboard/contracts';

import { useProjectEnvironmentVariables } from '../composables/useProjectEnvironmentVariables';
import LoadingSkeleton from './LoadingSkeleton.vue';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();

const environment = useProjectEnvironmentVariables(() => props.project);

watch(environment.errorMessage, (value) => {
  if (!value) return;
  toast.error('Não foi possível concluir a ação.', { description: value });
});
</script>

<template>
  <section
    class="project-environment-panel"
    :aria-busy="environment.loading.value"
  >
    <LoadingSkeleton
      v-if="environment.loading.value && !environment.overview.value"
      label="Carregando variáveis de ambiente…"
      :rows="2"
    />

    <template v-else-if="environment.overview.value">
      <p
        v-if="environment.overview.value.files.length === 0"
        class="project-environment-empty"
      >
        Nenhum arquivo <code>.env</code> reconhecido foi encontrado neste
        projeto.
      </p>

      <Card
        v-for="file in environment.overview.value.files"
        :key="file.file"
        class="project-environment-file-card"
      >
        <template #header>
          <h3>
            <code>{{ file.file }}</code>
          </h3>
        </template>

        <table class="project-environment-table">
          <thead>
            <tr>
              <th scope="col">Variável</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="variable in file.variables" :key="variable.name">
              <td>
                <code>{{ variable.name }}</code>
              </td>
              <td>
                <div
                  v-if="variable.sensitive"
                  class="project-environment-sensitive-value"
                >
                  <template
                    v-if="
                      environment.hasRevealedValue(file.file, variable.name)
                    "
                  >
                    <code
                      v-if="environment.revealedValue(file.file, variable.name)"
                      class="project-environment-secret-value"
                      >{{
                        environment.revealedValue(file.file, variable.name)
                      }}</code
                    >
                    <span v-else class="project-environment-empty-value"
                      >vazio</span
                    >
                    <button
                      type="button"
                      class="secondary-button project-environment-value-action"
                      :aria-label="`Ocultar valor de ${variable.name}`"
                      @click="environment.hideValue(file.file, variable.name)"
                    >
                      <EyeSlashIcon aria-hidden="true" />
                      Ocultar
                    </button>
                  </template>
                  <template v-else>
                    <StatusBadge tone="warning">Oculto (segredo)</StatusBadge>
                    <button
                      type="button"
                      class="secondary-button project-environment-value-action"
                      :disabled="
                        environment.isRevealingValue(file.file, variable.name)
                      "
                      :aria-label="`Exibir valor de ${variable.name}`"
                      @click="environment.revealValue(file.file, variable.name)"
                    >
                      <EyeIcon aria-hidden="true" />
                      {{
                        environment.isRevealingValue(file.file, variable.name)
                          ? 'Exibindo…'
                          : 'Exibir'
                      }}
                    </button>
                  </template>
                </div>
                <code v-else-if="variable.value">{{ variable.value }}</code>
                <span v-else class="project-environment-empty-value"
                  >vazio</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </template>
  </section>
</template>

<style scoped>
.project-environment-panel {
  display: flex;
  min-height: 0;
  height: auto;
  max-height: calc(100vh - var(--project-sticky-offset, 160px));
  flex: 1 1 auto;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 24px;
  scrollbar-width: thin;
}

.project-environment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 12px;
  border-bottom: 1px solid var(--border);
}

.project-environment-header > div {
  display: grid;
  gap: 5px;
}

.project-environment-breadcrumb {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.project-environment-header .dd-status-badge {
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .project-environment-header {
    align-items: stretch;
    flex-direction: column;
  }

  .project-environment-header .dd-status-badge {
    align-self: flex-start;
  }
}

.project-environment-header h2 {
  margin: 0;
  font-size: clamp(20px, 2.1vw, 27px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

.project-environment-header p {
  max-width: 72ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.55;
}

.project-environment-notice {
  color: var(--text-muted);
  font-size: var(--font-sm);
  margin: 0;
}

.project-environment-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.project-environment-file-card h3 {
  margin: 0;
  font-size: var(--font-md);
}

.project-environment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.project-environment-table th,
.project-environment-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
  word-break: break-word;
}

.project-environment-sensitive-value {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.project-environment-secret-value {
  min-width: 0;
  overflow-wrap: anywhere;
}

.project-environment-value-action {
  min-height: 28px;
  padding: 3px var(--space-2);
  font-size: var(--font-xs);
  white-space: nowrap;
}

.project-environment-value-action svg {
  width: 14px;
  height: 14px;
}

.project-environment-empty-value {
  color: var(--text-muted);
}
</style>
