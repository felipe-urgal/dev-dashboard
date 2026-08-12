<script setup lang="ts">
import {
  ArrowPathIcon,
  BeakerIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, reactive, ref } from 'vue';
import type {
  RetentionSettings,
  RetentionSettingsSnapshot,
} from '@dev-dashboard/contracts';
import { fetchRetentionSettings, updateRetentionSettings } from '../api';
import LoadingSkeleton from '../components/LoadingSkeleton.vue';
import { useAutoDismiss } from '../composables/useAutoDismiss';

const snapshot = ref<RetentionSettingsSnapshot>();
const form = reactive<RetentionSettings>({
  retentionDays: 7,
  scriptHistoryLimit: 200,
  testHistoryLimit: 50,
});
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const feedback = ref('');

function fill(values: RetentionSettings): void {
  Object.assign(form, values);
}

const hasChanges = computed(() => {
  const values = snapshot.value?.values;
  return Boolean(
    values &&
    (values.retentionDays !== form.retentionDays ||
      values.scriptHistoryLimit !== form.scriptHistoryLimit ||
      values.testHistoryLimit !== form.testHistoryLimit),
  );
});

useAutoDismiss(error, '');
useAutoDismiss(feedback, '');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    snapshot.value = await fetchRetentionSettings();
    fill(snapshot.value.values);
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Não foi possível carregar as configurações.';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = '';
  feedback.value = '';
  try {
    snapshot.value = await updateRetentionSettings({ ...form });
    fill(snapshot.value.values);
    feedback.value =
      'Configurações salvas. Reinicie a API para aplicar os novos valores aos gerenciadores.';
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Não foi possível salvar as configurações.';
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section
    class="content settings-page"
    :aria-busy="loading"
    aria-labelledby="settings-title"
  >
    <header class="settings-heading">
      <div>
        <span class="section-kicker">Ambiente local</span>
        <h2 id="settings-title">Configurações</h2>
        <p class="section-description">
          Defina por quanto tempo estados e logs terminais permanecem locais.
        </p>
      </div>

      <div class="settings-save">
        <button
          class="primary-button settings-save-button"
          type="submit"
          form="retention-settings"
          :disabled="loading || saving || !snapshot || !hasChanges"
        >
          {{ saving ? 'Salvando…' : 'Salvar alterações' }}
        </button>
        <span>{{
          hasChanges
            ? 'Você tem alterações não salvas.'
            : 'Configurações atualizadas.'
        }}</span>
      </div>
    </header>

    <LoadingSkeleton
      v-if="loading"
      label="Carregando configurações…"
      :rows="4"
    />

    <form
      v-else-if="snapshot"
      id="retention-settings"
      class="settings-form"
      aria-label="Configurações de retenção"
      @submit.prevent="save"
    >
      <section class="settings-panel" aria-labelledby="local-files-title">
        <header class="settings-section-heading">
          <DocumentTextIcon aria-hidden="true" />
          <div>
            <h3 id="local-files-title">Arquivos locais</h3>
            <p>
              Defina por quanto tempo os arquivos de logs permanecem armazenados
              localmente.
            </p>
          </div>
        </header>

        <label class="settings-row" for="retention-days-input">
          <span class="settings-row-copy">
            <strong id="retention-days-label">Retenção de logs</strong>
            <span id="retention-days-description"
              >Tempo que os arquivos de logs permanecem no disco local.</span
            >
            <small id="retention-days-limits"
              >Entre {{ snapshot.limits.retentionDays.minimum }} e
              {{ snapshot.limits.retentionDays.maximum }} dias.</small
            >
          </span>
          <span class="settings-number-control">
            <input
              id="retention-days-input"
              v-model.number="form.retentionDays"
              type="number"
              step="1"
              required
              :min="snapshot.limits.retentionDays.minimum"
              :max="snapshot.limits.retentionDays.maximum"
              aria-labelledby="retention-days-label"
              aria-describedby="retention-days-description retention-days-limits"
            />
            <span aria-hidden="true"
              >dia{{ form.retentionDays === 1 ? '' : 's' }}</span
            >
          </span>
        </label>

        <div class="settings-section-divider" />

        <header class="settings-section-heading">
          <ClockIcon aria-hidden="true" />
          <div>
            <h3>Limites do histórico</h3>
            <p>
              Defina a quantidade máxima de registros mantidos em cada
              histórico.
            </p>
          </div>
        </header>

        <div class="settings-row-group">
          <label class="settings-row" for="script-history-limit-input">
            <span class="settings-row-copy">
              <strong id="script-history-limit-label"
                >Histórico de scripts</strong
              >
              <span id="script-history-limit-description"
                >Quantidade máxima de registros mantidos no histórico de
                scripts.</span
              >
              <small id="script-history-limit-limits"
                >Entre {{ snapshot.limits.scriptHistoryLimit.minimum }} e
                {{ snapshot.limits.scriptHistoryLimit.maximum }}
                registros.</small
              >
            </span>
            <span class="settings-number-control">
              <input
                id="script-history-limit-input"
                v-model.number="form.scriptHistoryLimit"
                type="number"
                step="1"
                required
                :min="snapshot.limits.scriptHistoryLimit.minimum"
                :max="snapshot.limits.scriptHistoryLimit.maximum"
                aria-labelledby="script-history-limit-label"
                aria-describedby="script-history-limit-description script-history-limit-limits"
              />
              <span aria-hidden="true">registros</span>
            </span>
          </label>

          <label class="settings-row" for="test-history-limit-input">
            <span class="settings-row-copy">
              <strong id="test-history-limit-label">Histórico de testes</strong>
              <span id="test-history-limit-description"
                >Quantidade máxima de registros mantidos no histórico de
                testes.</span
              >
              <small id="test-history-limit-limits"
                >Entre {{ snapshot.limits.testHistoryLimit.minimum }} e
                {{ snapshot.limits.testHistoryLimit.maximum }} registros.</small
              >
            </span>
            <span class="settings-number-control">
              <input
                id="test-history-limit-input"
                v-model.number="form.testHistoryLimit"
                type="number"
                step="1"
                required
                :min="snapshot.limits.testHistoryLimit.minimum"
                :max="snapshot.limits.testHistoryLimit.maximum"
                aria-labelledby="test-history-limit-label"
                aria-describedby="test-history-limit-description test-history-limit-limits"
              />
              <span aria-hidden="true">registros</span>
            </span>
          </label>
        </div>

        <aside class="settings-notice">
          <ExclamationTriangleIcon aria-hidden="true" />
          <span>
            <strong>Atenção: salvar não remove arquivos.</strong>
            Os novos valores passam a valer após reiniciar a API.
          </span>
        </aside>

        <dl class="settings-summary">
          <div>
            <DocumentTextIcon aria-hidden="true" />
            <div>
              <dt>Logs</dt>
              <dd>
                {{ form.retentionDays }} dia{{
                  form.retentionDays === 1 ? '' : 's'
                }}
              </dd>
            </div>
          </div>
          <div>
            <CodeBracketIcon aria-hidden="true" />
            <div>
              <dt>Scripts</dt>
              <dd>{{ form.scriptHistoryLimit }} registros</dd>
            </div>
          </div>
          <div>
            <BeakerIcon aria-hidden="true" />
            <div>
              <dt>Testes</dt>
              <dd>{{ form.testHistoryLimit }} registros</dd>
            </div>
          </div>
          <div>
            <ArrowPathIcon aria-hidden="true" />
            <div>
              <dt>Reinício necessário</dt>
              <dd>Sim</dd>
            </div>
          </div>
        </dl>
      </section>

      <p v-if="error" class="alert alert-error settings-feedback" role="alert">
        {{ error }}
      </p>
      <p
        v-if="feedback"
        class="alert alert-success settings-feedback"
        role="status"
      >
        {{ feedback }}
      </p>
    </form>
  </section>
</template>
