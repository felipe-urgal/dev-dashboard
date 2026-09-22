<script setup lang="ts">
import {
  ChevronRightIcon,
  PlayIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchSecurityCenterAvailability,
  fetchSecurityCenterSnapshot,
  scanProjectSecurityCenter,
  type SecurityCenterAvailabilityResponse,
  type SecurityCenterScanResponse,
  type SecurityCenterSnapshotResponse,
  type SecurityFinding,
} from '../api/security-center';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const loadingAvailability = ref(false);
const scanning = ref(false);
const errorMessage = ref('');
const availability = ref<SecurityCenterAvailabilityResponse | null>(null);
const snapshot = ref<SecurityCenterSnapshotResponse['snapshot']>(null);
const scan = ref<SecurityCenterScanResponse | null>(null);
let generation = 0;

const availabilityTone = computed<StatusBadgeTone>(() => {
  if (availability.value?.availability.state === 'available') return 'success';
  if (availability.value?.availability.state === 'missing') return 'neutral';
  return 'warning';
});

const availabilityLabel = computed(() => {
  if (availability.value?.availability.state === 'available')
    return 'Disponível';
  if (availability.value?.availability.state === 'missing')
    return 'Não instalado';
  return 'Indisponível';
});

const canScan = computed(
  () =>
    availability.value?.availability.state === 'available' && !scanning.value,
);

const completedResult = computed(
  () =>
    snapshot.value?.result ??
    (scan.value?.execution.state === 'completed'
      ? scan.value.execution.result
      : undefined),
);

const findings = computed<SecurityFinding[]>(
  () => completedResult.value?.findings ?? [],
);

const hasCompletedScan = computed(() => completedResult.value !== undefined);

const evidenceObservedAt = computed(
  () =>
    snapshot.value?.result.observedAt ??
    (scan.value?.execution.state === 'completed'
      ? scan.value.execution.observedAt
      : undefined),
);

const lastScanLabel = computed(() => {
  if (scanning.value) return 'Em execução';

  const observedAt =
    scan.value?.execution.observedAt ?? snapshot.value?.result.observedAt;
  return observedAt ? formatDate(observedAt) : 'Nunca executado';
});

const providerLabel = computed(() => {
  const provider = availability.value?.provider;
  if (!provider) return 'Scanner';
  return provider === 'trivy' ? 'Trivy' : provider;
});

const versionLabel = computed(() => {
  const version = availability.value?.availability.version;
  if (!version) return '';
  return version.startsWith('v') ? version : `v${version}`;
});

const scanButtonLabel = computed(() => {
  if (scanning.value) return 'Escaneando…';
  return hasCompletedScan.value ? 'Executar novamente' : 'Executar scan';
});

const emptyTitle = computed(() => {
  if (scan.value && scan.value.execution.state !== 'completed') {
    return 'Scan inconclusivo';
  }
  if (availability.value?.availability.state !== 'available') {
    return 'Scanner não disponível';
  }
  return 'Nenhum scan executado';
});

const emptyDescription = computed(() => {
  if (scan.value && scan.value.execution.state !== 'completed') {
    return (
      scan.value.execution.diagnostic ??
      'O provider não conseguiu produzir um resultado confiável.'
    );
  }
  if (availability.value?.availability.state !== 'available') {
    return (
      availability.value?.availability.diagnostic ??
      'O scanner não está disponível para execução neste momento.'
    );
  }
  return 'Execute um scan para verificar secrets e configurações incorretas.';
});

const severityOrder: Record<SecurityFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4,
};

const severityCounts = computed(() =>
  findings.value.reduce(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
    } satisfies Record<SecurityFinding['severity'], number>,
  ),
);

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

function findingDescription(finding: SecurityFinding): string {
  return (
    finding.remediation ??
    `${categoryLabel(finding.category)} · ${finding.ruleId}`
  );
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
  snapshot.value = null;

  const [availabilityResult, snapshotResult] = await Promise.allSettled([
    fetchSecurityCenterAvailability(),
    fetchSecurityCenterSnapshot(props.project.id),
  ]);
  if (requestGeneration !== generation) return;

  if (availabilityResult.status === 'fulfilled') {
    availability.value = availabilityResult.value;
  } else {
    availability.value = null;
    errorMessage.value =
      availabilityResult.reason instanceof Error
        ? availabilityResult.reason.message
        : 'Não foi possível consultar o Security Center.';
  }

  if (snapshotResult.status === 'fulfilled') {
    snapshot.value = snapshotResult.value.snapshot;
  } else if (availabilityResult.status === 'fulfilled') {
    errorMessage.value =
      snapshotResult.reason instanceof Error
        ? snapshotResult.reason.message
        : 'Não foi possível carregar o último snapshot de segurança.';
  }

  loadingAvailability.value = false;
}

async function runScan(): Promise<void> {
  if (!canScan.value) return;
  scanning.value = true;
  errorMessage.value = '';

  try {
    scan.value = await scanProjectSecurityCenter(props.project.id);
    if (scan.value.execution.state === 'completed') {
      const persisted = await fetchSecurityCenterSnapshot(props.project.id);
      snapshot.value = persisted.snapshot;
    } else {
      errorMessage.value =
        scan.value.execution.diagnostic ??
        'O provider não conseguiu produzir um resultado confiável.';
    }
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
  <section
    class="security-center-panel"
    aria-labelledby="security-center-title"
  >
    <header class="security-center-header">
      <div class="security-center-identity">
        <ShieldCheckIcon class="security-center-icon" aria-hidden="true" />
        <div class="security-center-heading">
          <h3 id="security-center-title">Segurança</h3>
          <div v-if="availability" class="security-center-scanner-summary">
            <strong>{{ providerLabel }}</strong>
            <span v-if="versionLabel" class="security-center-version">
              {{ versionLabel }}
            </span>
            <StatusBadge :tone="availabilityTone" size="md">
              {{ availabilityLabel }}
            </StatusBadge>
            <span class="security-center-divider" aria-hidden="true"></span>
            <span class="security-center-last-scan">
              Último scan: {{ lastScanLabel }}
            </span>
          </div>
        </div>
      </div>

      <button
        v-if="availability"
        class="primary-button security-center-scan-button"
        type="button"
        :disabled="!canScan"
        @click="runScan"
      >
        <PlayIcon v-if="!scanning" aria-hidden="true" />
        {{ scanButtonLabel }}
      </button>
    </header>

    <div v-if="loadingAvailability" class="security-center-placeholder">
      <ShieldCheckIcon aria-hidden="true" />
      <strong>Consultando scanner</strong>
      <span>Verificando se o provider de segurança está disponível.</span>
    </div>

    <div
      v-else-if="errorMessage && !availability"
      class="security-center-placeholder"
      role="alert"
    >
      <ShieldCheckIcon aria-hidden="true" />
      <strong>Security Center indisponível</strong>
      <span>{{ errorMessage }}</span>
      <button class="primary-button" type="button" @click="loadAvailability">
        Tentar novamente
      </button>
    </div>

    <template v-else-if="availability">
      <p
        v-if="errorMessage && (hasCompletedScan || !scan)"
        class="security-center-error"
        role="alert"
      >
        {{ errorMessage }}
      </p>

      <section class="security-center-results" aria-label="Resultados">
        <template v-if="hasCompletedScan">
          <h4>Resultados</h4>

          <div
            class="security-center-severity-grid"
            aria-label="Contagem por severidade"
          >
            <article
              class="security-center-severity security-center-severity--critical"
            >
              <span>Críticas</span>
              <strong>{{ severityCounts.critical }}</strong>
            </article>
            <article
              class="security-center-severity security-center-severity--high"
            >
              <span>Altas</span>
              <strong>{{ severityCounts.high }}</strong>
            </article>
            <article
              class="security-center-severity security-center-severity--medium"
            >
              <span>Médias</span>
              <strong>{{ severityCounts.medium }}</strong>
            </article>
            <article
              class="security-center-severity security-center-severity--low"
            >
              <span>Baixas</span>
              <strong>{{ severityCounts.low }}</strong>
            </article>
          </div>

          <div class="security-center-findings">
            <h5>
              {{ findings.length }}
              {{ findings.length === 1 ? 'resultado' : 'resultados' }}
            </h5>

            <div
              v-if="findings.length === 0"
              class="security-center-placeholder security-center-placeholder--compact"
            >
              <ShieldCheckIcon aria-hidden="true" />
              <strong>Nenhum finding encontrado</strong>
              <span>
                Scan concluído em {{ formatDate(evidenceObservedAt ?? '') }}.
              </span>
            </div>

            <div v-else class="security-center-table-wrap">
              <table class="security-center-table">
                <thead>
                  <tr>
                    <th>Severidade</th>
                    <th>Título</th>
                    <th>Arquivo</th>
                    <th>Linha</th>
                    <th>Descrição</th>
                    <th aria-label="Detalhes"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="finding in sortedFindings"
                    :key="finding.fingerprint"
                  >
                    <td>
                      <StatusBadge :tone="severityTone(finding.severity)">
                        {{ severityLabel(finding.severity) }}
                      </StatusBadge>
                    </td>
                    <td class="security-center-finding-title">
                      {{ finding.title }}
                    </td>
                    <td>
                      <code>{{ finding.file }}</code>
                    </td>
                    <td>{{ finding.line ?? '—' }}</td>
                    <td class="security-center-finding-description">
                      {{ findingDescription(finding) }}
                    </td>
                    <td class="security-center-finding-chevron">
                      <ChevronRightIcon aria-hidden="true" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <div v-else class="security-center-placeholder">
          <ShieldCheckIcon aria-hidden="true" />
          <strong>{{ emptyTitle }}</strong>
          <span>{{ emptyDescription }}</span>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.security-center-panel {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.security-center-header {
  display: flex;
  min-height: 100px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.security-center-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-5);
}

.security-center-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  color: var(--accent);
}

.security-center-heading {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}

.security-center-heading h3,
.security-center-results h4,
.security-center-findings h5 {
  margin: 0;
  color: var(--text);
  font-weight: var(--font-weight-strong);
}

.security-center-heading h3 {
  font-size: var(--font-xl);
}

.security-center-scanner-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-muted);
}

.security-center-scanner-summary > strong {
  color: var(--text);
  font-size: var(--font-lg);
}

.security-center-version {
  padding: 3px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-sm);
}

.security-center-divider {
  width: 1px;
  height: 22px;
  background: var(--border-strong);
}

.security-center-last-scan {
  overflow: hidden;
  font-size: var(--font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.security-center-scan-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  white-space: nowrap;
}

.security-center-scan-button svg {
  width: 16px;
  height: 16px;
}

.security-center-error {
  margin: var(--space-3) var(--space-5) 0;
  color: var(--danger-text);
  font-size: var(--font-sm);
}

.security-center-results {
  display: grid;
  gap: var(--space-3);
  min-height: 250px;
  padding: var(--space-4) var(--space-5) var(--space-5);
}

.security-center-results h4 {
  font-size: var(--font-md);
}

.security-center-severity-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-5);
}

.security-center-severity {
  position: relative;
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.security-center-severity::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: var(--text-muted);
  content: '';
}

.security-center-severity span {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.security-center-severity strong {
  color: var(--text);
  font-size: 1.45rem;
  line-height: 1;
}

.security-center-severity--critical::before {
  background: var(--danger-text);
}

.security-center-severity--high::before {
  background: #ff6a3d;
}

.security-center-severity--medium::before {
  background: var(--warning-text);
}

.security-center-severity--low::before {
  background: var(--success-text);
}

.security-center-findings {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.security-center-findings h5 {
  font-size: var(--font-md);
}

.security-center-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.security-center-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.security-center-table th {
  padding: 9px var(--space-3);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border);
}

.security-center-table td {
  padding: 10px var(--space-3);
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.security-center-table tbody tr:last-child td {
  border-bottom: 0;
}

.security-center-table tbody tr:hover {
  background: var(--surface-2);
}

.security-center-table code {
  color: var(--text);
  font-family: var(--font-family-code);
  font-size: var(--font-sm);
}

.security-center-finding-title {
  color: var(--text) !important;
  font-weight: var(--font-weight-strong);
}

.security-center-finding-description {
  min-width: 220px;
}

.security-center-finding-chevron {
  width: 36px;
  text-align: right;
}

.security-center-finding-chevron svg {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.security-center-placeholder {
  display: grid;
  min-height: 198px;
  place-items: center;
  align-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--text-muted);
  text-align: center;
}

.security-center-placeholder > svg {
  width: 42px;
  height: 42px;
  margin-bottom: var(--space-3);
  color: var(--text-muted);
}

.security-center-placeholder > strong {
  color: var(--text);
  font-size: var(--font-md);
  font-weight: var(--font-weight-strong);
}

.security-center-placeholder > span {
  font-size: var(--font-sm);
}

.security-center-placeholder > button {
  margin-top: var(--space-2);
}

.security-center-placeholder--compact {
  min-height: 150px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

@media (max-width: 900px) {
  .security-center-severity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }
}

@media (max-width: 680px) {
  .security-center-header {
    min-height: 0;
    align-items: stretch;
    flex-direction: column;
  }

  .security-center-identity {
    align-items: flex-start;
  }

  .security-center-scanner-summary {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .security-center-divider {
    display: none;
  }

  .security-center-last-scan {
    width: 100%;
    white-space: normal;
  }

  .security-center-scan-button {
    width: 100%;
  }

  .security-center-results {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }
}

@media (max-width: 480px) {
  .security-center-icon {
    width: 36px;
    height: 36px;
  }

  .security-center-severity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
