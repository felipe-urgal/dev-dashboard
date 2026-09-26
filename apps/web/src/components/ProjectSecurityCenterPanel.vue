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
  <section class="security-center-panel" aria-label="Segurança">
    <header class="security-center-header">
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
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.security-center-header {
  display: flex;
  min-height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.security-center-scanner-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}

.security-center-scanner-summary > strong {
  color: var(--text);
  font-size: 10px;
}

.security-center-version {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 8px;
}

.security-center-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.security-center-last-scan {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.security-center-scan-button {
  display: inline-flex;
  min-height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-inline: 11px;
  white-space: nowrap;
  font-size: 10px;
}

.security-center-scan-button svg {
  width: 15px;
  height: 15px;
}

.security-center-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 10px;
}

.security-center-results {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.security-center-severity-grid {
  display: grid;
  min-height: 54px;
  flex: 0 0 auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.security-center-severity {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
}

.security-center-severity + .security-center-severity {
  border-left: 1px solid var(--border);
}

.security-center-severity span {
  color: var(--text-muted);
  font-size: 9px;
}

.security-center-severity strong {
  color: var(--text);
  font-size: 16px;
  line-height: 1;
}

.security-center-severity--critical strong {
  color: var(--danger-text);
}
.security-center-severity--high strong {
  color: #ff6a3d;
}
.security-center-severity--medium strong {
  color: var(--warning-text);
}
.security-center-severity--low strong {
  color: var(--success-text);
}

.security-center-findings {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.security-center-findings h5 {
  min-height: 42px;
  flex: 0 0 auto;
  margin: 0;
  padding: 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 10px;
}

.security-center-table-wrap {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}

.security-center-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}

.security-center-table th {
  position: sticky;
  z-index: 2;
  top: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
}

.security-center-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  vertical-align: middle;
}

.security-center-table tbody tr:hover {
  background: var(--surface-2);
}

.security-center-table code {
  color: var(--text);
  font-family: var(--font-family-code);
  font-size: 9px;
}

.security-center-finding-title {
  color: var(--text) !important;
  font-weight: var(--font-weight-strong);
}

.security-center-finding-description {
  min-width: 220px;
}

.security-center-finding-chevron {
  width: 32px;
  text-align: right;
}

.security-center-finding-chevron svg {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.security-center-placeholder {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-content: center;
  justify-items: center;
  gap: 7px;
  padding: 28px 18px;
  color: var(--text-muted);
  text-align: center;
}

.security-center-placeholder > svg {
  width: 30px;
  height: 30px;
  margin-bottom: 4px;
  color: var(--text-muted);
}

.security-center-placeholder > strong {
  color: var(--text);
  font-size: 11px;
}

.security-center-placeholder > span {
  max-width: 520px;
  font-size: 10px;
  line-height: 1.45;
}

.security-center-placeholder > button {
  margin-top: 4px;
}

.security-center-placeholder--compact {
  flex: 1 1 auto;
}

@media (max-width: 820px) {
  .security-center-severity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .security-center-severity:nth-child(3) {
    border-left: 0;
  }

  .security-center-severity:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 620px) {
  .security-center-header {
    align-items: stretch;
    flex-direction: column;
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

  .security-center-severity-grid {
    grid-template-columns: 1fr;
  }

  .security-center-severity + .security-center-severity {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}
</style>
