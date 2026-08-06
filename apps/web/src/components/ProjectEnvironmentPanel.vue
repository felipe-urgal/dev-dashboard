<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline';
import type { Project } from '@dev-dashboard/contracts';

import { useProjectEnvironmentVariables } from '../composables/useProjectEnvironmentVariables';
import LoadingSkeleton from './LoadingSkeleton.vue';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const environment = useProjectEnvironmentVariables(() => props.project);
</script>

<template>
  <section
    class="project-environment-panel"
    :aria-busy="environment.loading.value"
  >
    <p class="project-environment-notice">
      Somente leitura: lido diretamente dos arquivos
      <code>.env</code> reconhecidos do projeto (<code>.env</code>,
      <code>.env.local</code>, <code>.env.development</code>,
      <code>.env.test</code>, <code>.env.production</code>). Valores com nome de
      segredo permanecem ocultos por padrão e só são carregados quando você
      clicar em <strong>Exibir</strong>.
    </p>

    <p
      v-if="environment.errorMessage.value"
      class="alert alert-error"
      role="alert"
    >
      {{ environment.errorMessage.value }}
    </p>

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
  flex-direction: column;
  gap: var(--space-4);
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
