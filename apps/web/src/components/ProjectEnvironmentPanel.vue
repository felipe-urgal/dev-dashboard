<script setup lang="ts">
import type { Project } from '@dev-dashboard/contracts';

import { useProjectEnvironmentVariables } from '../composables/useProjectEnvironmentVariables';
import LoadingSkeleton from './LoadingSkeleton.vue';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const environment = useProjectEnvironmentVariables(() => props.project);
</script>

<template>
  <section class="project-environment-panel" :aria-busy="environment.loading.value">
    <p class="project-environment-notice">
      Somente leitura: lido diretamente dos arquivos <code>.env</code> reconhecidos do projeto
      (<code>.env</code>, <code>.env.local</code>, <code>.env.development</code>, <code>.env.test</code>,
      <code>.env.production</code>). Variáveis com nome de segredo (token, senha, chave, credencial)
      nunca têm o valor exibido — apenas o nome.
    </p>

    <p v-if="environment.errorMessage.value" class="alert alert-error" role="alert">
      {{ environment.errorMessage.value }}
    </p>

    <LoadingSkeleton
      v-if="environment.loading.value && !environment.overview.value"
      label="Carregando variáveis de ambiente…"
      :rows="2"
    />

    <template v-else-if="environment.overview.value">
      <p v-if="environment.overview.value.files.length === 0" class="project-environment-empty">
        Nenhum arquivo <code>.env</code> reconhecido foi encontrado neste projeto.
      </p>

      <Card
        v-for="file in environment.overview.value.files"
        :key="file.file"
        class="project-environment-file-card"
      >
        <template #header>
          <h3><code>{{ file.file }}</code></h3>
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
              <td><code>{{ variable.name }}</code></td>
              <td>
                <StatusBadge v-if="variable.sensitive" tone="warning">Oculto (segredo)</StatusBadge>
                <code v-else-if="variable.value">{{ variable.value }}</code>
                <span v-else class="project-environment-empty-value">vazio</span>
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

.project-environment-empty-value {
  color: var(--text-muted);
}
</style>
