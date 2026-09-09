<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchSecurityCenterAvailability,
  scanProjectSecurityCenter,
  type SecurityCenterAvailabilityResponse,
  type SecurityCenterScanResponse,
  type SecurityFinding,
} from '../api/security-center';
import EmptyState from './EmptyState.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const loadingAvailability = ref(false);
const scanning = ref(false);
const errorMessage = ref('');
const availability = ref<SecurityCenterAvailabilityResponse | null>(null);
const scan = ref<SecurityCenterScanResponse | null>(null);
let generation = 0;

const availabilityTone = computed<StatusBadgeTone>(() => {
  if (availability.value?.availability.state === 'available') return 'success';
  if (availability.value?.availability.state === 'missing') return 'neutral';
  return 'warning';
});

const availabilityLabel = computed(() => {
  if (availability.value?.availability.state === 'available') return 'Disponível';
  if (availability.value?.availability.state === 'missing') return 'Não instalado';
  return 'Indisponível';
});

const canScan = computed(
  () => availability.value?.availability.state === 'available' && !scanning.value,
);

const findings = computed<SecurityFinding[]>(
  () => scan.value?.execution.result?.findings ?? [],
);

const severityOrder: Record<SecurityFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4,
};

const sortedFindings = computed(() =>
  [...findings.value].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.file.localeCompare(right.file) ||
      (left.line ?? 0) - (right.line ?? 0),
  ),
);

function severityTone(severity: SecurityFinding['severity']): StatusBadgeTone {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'success';
  return 'neutral';
}

function severityLabel(severity: SecurityFinding['severity']): string {
  if (severity === 'critical') return 'Crítica';
  if (severity === 'high') return 'Alta';
  if (severity === 'medium') return 'Média';
  if (severity === 'low') return 'Baixa';
  return 'Desconhecida';
}

function categoryLabel(category: SecurityFinding['category']): string {
  return category === 'secret' ? 'Secret' : 'Misconfiguration';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function loadAvailability(): Promise<void> {
  const requestGeneration = ++generation;
  loadingAvailability.value = true;
  errorMessage.value = '';
  scan.value = null;

  try {
    const result = await fetchSecurityCenterAvailability();
    if (requestGeneration === generation) availability.value = result;
  } catch (error) {
    if (requestGeneration === generation) {
      availability.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o Security Center.';
    }
  } finally {
    if (requestGeneration === generation) loadingAvailability.value = false;
  }
}

async function runScan(): Promise<void> {
  if (!canScan.value) return;
  scanning.value = true;
  errorMessage.value = '';

  try {
    scan.value = await scanProjectSecurityCenter(props.project.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível executar o scan de segurança.';
  } finally {
    scanning.value = false;
  }
}

watch(
  () => props.project.id,
  () => void loadAvailability(),
  { immediate: true },
);
</script>

<template>
  <section class="security-center-panel dd-card" aria-labelledby="security-center-title">
    <header class="security-center-header">
      <div>
        <span class="security-center-eyebrow">Segurança local</span>
        <h3 id="security-center-title">Security Center</h3>
        <p>
          Scan manual e somente leitura de secrets e misconfigurations. O navegador
          não envia path, executável ou argumentos do scanner.
        </p>
      </div>
      <StatusBadge v-if="availability" :tone="availabilityTone" size="md">
        {{ availabilityLabel }}
      </StatusBadge>
    </header>

    <EmptyState
      v-if="loadingAvailability"
      icon="•••"
      title="Consultando scanner"
      description="Verificando se o provider de segurança está disponível."
    />

    <EmptyState
      v-else-if="errorMessage && !availability"
      icon="!"
      title="Security Center indisponível"
      :description="errorMessage"
    >
      <template #actions>
        <button class="primary-button" type="button" @click="loadAvailability">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <template v-else-if="availability">
      <div class="security-center-summary">
        <div>
          <strong>{{ availability.provider }}</strong>
          <span v-if="availability.availability.version">
            {{ availability.availability.version }}
          </span>
        </div>
        <span>Observado em {{ formatDate(availability.availability.observedAt) }}</span>
      </div>

      <p
        v-if="availability.availability.diagnostic"
        class="security-center-diagnostic"
      >
        {{ availability.availability.diagnostic }}
      </p>

      <div class="security-center-actions">
        <button
          class="primary-button"
          type="button"
          :disabled="!canScan"
          @click="runScan"
        >
          {{ scanning ? 'Escaneando…' : 'Executar scan' }}
        </button>
        <span>Execução manual; nenhum resultado é persistido neste recorte.</span>
      </div>

      <p v-if="errorMessage" class="security-center-error" role="alert">
        {{ errorMessage }}
      </p>

      <EmptyState
        v-if="scan?.execution.state === 'completed' && findings.length === 0"
        icon="✓"
        title="Nenhum finding encontrado"
        :description="`Scan concluído em ${formatDate(scan.execution.observedAt)}.`"
      />

      <EmptyState
        v-else-if="scan && scan.execution.state !== 'completed'"
        icon="!"
        title="Scan inconclusivo"
        :description="scan.execution.diagnostic ?? 'O provider não conseguiu produzir um resultado confiável.'"
      />

      <div v-else-if="sortedFindings.length > 0" class="security-center-results">
        <div class="security-center-results-header">
          <strong>{{ sortedFindings.length }} finding(s)</strong>
          <span v-if="scan">Atualizado em {{ formatDate(scan.execution.observedAt) }}</span>
        </div>

        <ul class="security-center-findings" aria-label="Findings de segurança">
          <li
            v-for="finding in sortedFindings"
            :key="finding.fingerprint"
            class="security-center-finding"
          >
            <div class="security-center-finding-main">
              <StatusBadge :tone="severityTone(finding.severity)">
                {{ severityLabel(finding.severity) }}
              </StatusBadge>
              <div>
                <strong>{{ finding.title }}</strong>
                <p>
                  {{ categoryLabel(finding.category) }} · {{ finding.ruleId }} ·
                  <code>{{ finding.file }}<template v-if="finding.line">:{{ finding.line }}</template></code>
                </p>
                <small v-if="finding.remediation">{{ finding.remediation }}</small>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.security-center-panel {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-5);
}

.security-center-header,
.security-center-actions,
.security-center-summary,
.security-center-results-header,
.security-center-finding,
.security-center-finding-main {
  display: flex;
  gap: var(--space-3);
}

.security-center-header,
.security-center-summary,
.security-center-results-header,
.security-center-finding {
  align-items: flex-start;
  justify-content: space-between;
}

.security-center-header h3,
.security-center-header p,
.security-center-diagnostic,
.security-center-error,
.security-center-finding p {
  margin: 0;
}

.security-center-header h3 {
  margin-top: var(--space-1);
}

.security-center-header p,
.security-center-actions span,
.security-center-summary span,
.security-center-results-header span,
.security-center-finding p,
.security-center-finding small,
.security-center-diagnostic {
  color: var(--text-muted);
}

.security-center-eyebrow {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.security-center-summary,
.security-center-results-header {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.security-center-summary > div,
.security-center-actions,
.security-center-results,
.security-center-finding-main > div {
  display: grid;
  gap: var(--space-1);
}

.security-center-actions {
  justify-items: start;
}

.security-center-error {
  color: var(--danger-text);
}

.security-center-findings {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.security-center-finding {
  padding: var(--space-4) 0;
  border-top: 1px solid var(--border-subtle);
}

.security-center-finding-main {
  min-width: 0;
}

.security-center-finding code {
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .security-center-header,
  .security-center-summary,
  .security-center-results-header,
  .security-center-finding,
  .security-center-finding-main {
    flex-direction: column;
  }
}
</style>
