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
  if (availability.value?.availability.state === 'available')
    return 'Disponível';
  if (availability.value?.availability.state === 'missing')
    return 'Não instalado';
  return 'Indisponível';
});

const availabilityStateClass = computed(() =>
  availability.value
    ? `security-center-state--${availability.value.availability.state}`
    : '',
);

const availabilityTitle = computed(() =>
  availability.value?.availability.state === 'available'
    ? 'Scanner pronto para executar'
    : 'Security Center ainda não pode executar scans',
);

const availabilityDiagnostic = computed(() => {
  if (availability.value?.availability.diagnostic) {
    return availability.value.availability.diagnostic;
  }
  if (availability.value?.availability.state === 'available') {
    return 'O provider está disponível para um scan manual nesta sessão.';
  }
  if (availability.value?.availability.state === 'missing') {
    return 'O scanner não está instalado ou não está disponível no PATH da API.';
  }
  return 'O provider não está disponível para execução neste momento.';
});

const canScan = computed(
  () =>
    availability.value?.availability.state === 'available' && !scanning.value,
);

const findings = computed<SecurityFinding[]>(
  () => scan.value?.execution.result?.findings ?? [],
);

const hasCompletedScan = computed(
  () => scan.value?.execution.state === 'completed',
);

const scanStateLabel = computed(() => {
  if (scanning.value) return 'Em execução';
  if (!scan.value) return 'Não executado';
  if (scan.value.execution.state === 'completed') return 'Concluído';
  return 'Inconclusivo';
});

const severityOrder: Record<SecurityFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unknown: 4,
};

const severityCounts = computed(() => {
  if (!hasCompletedScan.value) return null;

  return findings.value.reduce(
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
  );
});

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

function severityCount(severity: SecurityFinding['severity']): string | number {
  return severityCounts.value?.[severity] ?? '—';
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
  <section
    class="security-center-panel"
    aria-labelledby="security-center-title"
  >
    <header class="security-center-header">
      <div>
        <span class="security-center-eyebrow">Segurança</span>
        <h3 id="security-center-title">Security Center</h3>
        <p>Scan manual e somente leitura de secrets e misconfigurations.</p>
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
      <section
        class="security-center-state"
        :class="availabilityStateClass"
        aria-labelledby="security-center-state-title"
      >
        <span class="security-center-state-marker" aria-hidden="true"></span>
        <div class="security-center-state-copy">
          <strong id="security-center-state-title">{{
            availabilityTitle
          }}</strong>
          <p>{{ availabilityDiagnostic }}</p>
        </div>
        <span class="security-center-observed">
          Observado em {{ formatDate(availability.availability.observedAt) }}
        </span>
      </section>

      <section class="security-center-scanner" aria-label="Estado do scanner">
        <div class="security-center-scanner-metric">
          <span>Scanner</span>
          <strong>{{ availability.provider }}</strong>
        </div>
        <div class="security-center-scanner-metric">
          <span>Versão</span>
          <strong>{{ availability.availability.version ?? '—' }}</strong>
        </div>
        <div class="security-center-scanner-metric">
          <span>Último scan</span>
          <strong>{{ scanStateLabel }}</strong>
        </div>
        <div class="security-center-scanner-metric">
          <span>Persistência</span>
          <strong>Somente sessão</strong>
        </div>
        <button
          class="primary-button security-center-scan-button"
          type="button"
          :disabled="!canScan"
          @click="runScan"
        >
          {{ scanning ? 'Escaneando…' : 'Executar scan' }}
        </button>
      </section>

      <p v-if="errorMessage" class="security-center-error" role="alert">
        {{ errorMessage }}
      </p>

      <section
        class="security-center-triage"
        aria-labelledby="security-center-triage-title"
      >
        <div class="security-center-section-heading">
          <div>
            <h4 id="security-center-triage-title">Triagem de riscos</h4>
            <p>
              Findings críticos aparecem primeiro e o restante segue por
              severidade.
            </p>
          </div>
          <span v-if="scan">
            {{ formatDate(scan.execution.observedAt) }}
          </span>
        </div>

        <div
          class="security-center-severity-grid"
          aria-label="Contagem por severidade"
        >
          <div
            class="security-center-severity security-center-severity--critical"
          >
            <span>Crítica</span>
            <strong>{{ severityCount('critical') }}</strong>
          </div>
          <div class="security-center-severity security-center-severity--high">
            <span>Alta</span>
            <strong>{{ severityCount('high') }}</strong>
          </div>
          <div
            class="security-center-severity security-center-severity--medium"
          >
            <span>Média</span>
            <strong>{{ severityCount('medium') }}</strong>
          </div>
          <div class="security-center-severity security-center-severity--low">
            <span>Baixa</span>
            <strong>{{ severityCount('low') }}</strong>
          </div>
          <div
            class="security-center-severity security-center-severity--unknown"
          >
            <span>Desconhecida</span>
            <strong>{{ severityCount('unknown') }}</strong>
          </div>
        </div>

        <div class="security-center-findings-heading">
          <h4>Findings</h4>
          <span>
            <template v-if="hasCompletedScan">
              {{ findings.length }} finding(s)
            </template>
            <template v-else-if="scan">Scan inconclusivo</template>
            <template v-else>Sem scan nesta sessão</template>
          </span>
        </div>

        <EmptyState
          v-if="!scan"
          class="security-center-empty"
          icon="—"
          title="Nenhum finding para exibir"
          description="Quando o scanner estiver disponível, execute um scan para preencher a triagem."
        />

        <EmptyState
          v-else-if="scan.execution.state !== 'completed'"
          class="security-center-empty"
          icon="!"
          title="Scan inconclusivo"
          :description="
            scan.execution.diagnostic ??
            'O provider não conseguiu produzir um resultado confiável.'
          "
        />

        <EmptyState
          v-else-if="findings.length === 0"
          class="security-center-empty"
          icon="✓"
          title="Nenhum finding encontrado"
          :description="`Scan concluído em ${formatDate(scan.execution.observedAt)}.`"
        />

        <ul
          v-else
          class="security-center-findings"
          aria-label="Findings de segurança"
        >
          <li
            v-for="finding in sortedFindings"
            :key="finding.fingerprint"
            class="security-center-finding"
          >
            <StatusBadge :tone="severityTone(finding.severity)">
              {{ severityLabel(finding.severity) }}
            </StatusBadge>
            <div class="security-center-finding-copy">
              <strong>{{ finding.title }}</strong>
              <p>
                {{ categoryLabel(finding.category) }} · {{ finding.ruleId }} ·
                <code
                  >{{ finding.file
                  }}<template v-if="finding.line"
                    >:{{ finding.line }}</template
                  ></code
                >
              </p>
              <small v-if="finding.remediation">{{
                finding.remediation
              }}</small>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.security-center-panel {
  display: grid;
  min-width: 0;
}

.security-center-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5) var(--space-4);
}

.security-center-header h3,
.security-center-header p,
.security-center-state p,
.security-center-section-heading h4,
.security-center-section-heading p,
.security-center-findings-heading h4,
.security-center-finding p {
  margin: 0;
}

.security-center-header h3 {
  margin-top: var(--space-1);
}

.security-center-header p,
.security-center-state p,
.security-center-section-heading p,
.security-center-findings-heading span,
.security-center-finding p,
.security-center-finding small,
.security-center-observed {
  color: var(--text-muted);
}

.security-center-eyebrow,
.security-center-scanner-metric span,
.security-center-severity span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.security-center-state {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  margin: 0 var(--space-5);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.security-center-state-marker {
  width: 4px;
  height: 100%;
  min-height: 42px;
  border-radius: 999px;
  background: var(--warning-text);
}

.security-center-state--available .security-center-state-marker {
  background: var(--success-text);
}

.security-center-state--missing .security-center-state-marker {
  background: var(--text-muted);
}

.security-center-state-copy {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.security-center-observed {
  font-size: var(--font-xs);
  white-space: nowrap;
}

.security-center-scanner {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr)) auto;
  align-items: center;
  gap: var(--space-4);
  margin: 0 var(--space-5);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}

.security-center-scanner-metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.security-center-scanner-metric strong {
  overflow-wrap: anywhere;
}

.security-center-scan-button {
  justify-self: end;
  white-space: nowrap;
}

.security-center-error {
  margin: var(--space-3) var(--space-5) 0;
  color: var(--danger-text);
}

.security-center-triage {
  display: grid;
  gap: 0;
  padding: var(--space-5);
}

.security-center-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
}

.security-center-section-heading > div {
  display: grid;
  gap: var(--space-1);
}

.security-center-section-heading > span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  white-space: nowrap;
}

.security-center-severity-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.security-center-severity {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  border-right: 1px solid var(--border);
}

.security-center-severity:first-child {
  padding-left: 0;
}

.security-center-severity:last-child {
  padding-right: 0;
  border-right: 0;
}

.security-center-severity strong {
  font-size: 1.35rem;
}

.security-center-severity--critical strong,
.security-center-severity--high strong {
  color: var(--danger-text);
}

.security-center-severity--medium strong {
  color: var(--warning-text);
}

.security-center-severity--low strong {
  color: var(--success-text);
}

.security-center-severity--unknown strong {
  color: var(--text-muted);
}

.security-center-findings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) 0 var(--space-3);
  border-bottom: 1px solid var(--border);
}

.security-center-findings-heading span {
  font-size: var(--font-xs);
}

.security-center-empty {
  margin-top: var(--space-4);
}

.security-center-findings {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.security-center-finding {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
}

.security-center-finding-copy {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.security-center-finding code {
  overflow-wrap: anywhere;
}

@media (max-width: 980px) {
  .security-center-scanner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .security-center-scan-button {
    justify-self: start;
  }
}

@media (max-width: 720px) {
  .security-center-header,
  .security-center-section-heading,
  .security-center-findings-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .security-center-state {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .security-center-observed {
    grid-column: 2;
    white-space: normal;
  }

  .security-center-severity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .security-center-severity,
  .security-center-severity:first-child,
  .security-center-severity:last-child {
    padding: var(--space-3) 0;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .security-center-severity:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
}

@media (max-width: 520px) {
  .security-center-scanner,
  .security-center-severity-grid {
    grid-template-columns: 1fr;
  }

  .security-center-severity:nth-last-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }

  .security-center-severity:last-child {
    border-bottom: 0;
  }

  .security-center-scan-button {
    width: 100%;
  }

  .security-center-finding {
    grid-template-columns: 1fr;
  }
}
</style>
