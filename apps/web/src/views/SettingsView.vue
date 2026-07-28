<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { RetentionSettings, RetentionSettingsSnapshot } from '@dev-dashboard/contracts';
import Card from '../components/Card.vue';
import { fetchRetentionSettings, updateRetentionSettings } from '../api';

const snapshot = ref<RetentionSettingsSnapshot>();
const form = reactive<RetentionSettings>({ retentionDays: 7, scriptHistoryLimit: 200, testHistoryLimit: 50 });
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const feedback = ref('');

function fill(values: RetentionSettings): void { Object.assign(form, values); }

async function load(): Promise<void> {
  loading.value = true; error.value = '';
  try { snapshot.value = await fetchRetentionSettings(); fill(snapshot.value.values); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as configurações.'; }
  finally { loading.value = false; }
}

async function save(): Promise<void> {
  saving.value = true; error.value = ''; feedback.value = '';
  try {
    snapshot.value = await updateRetentionSettings({ ...form });
    feedback.value = 'Configurações salvas. Reinicie a API para aplicar os novos valores aos gerenciadores.';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar as configurações.'; }
  finally { saving.value = false; }
}

onMounted(() => void load());
</script>

<template>
  <section class="settings-page">
    <Card title="Retenção local" eyebrow="Armazenamento seguro">
      <p>Defina por quanto tempo estados e logs terminais permanecem locais e quantos registros cada histórico conserva.</p>
      <p v-if="loading" role="status">Carregando configurações…</p>
      <form v-else-if="snapshot" class="settings-form" @submit.prevent="save">
        <label>Retenção de logs (dias)
          <input v-model.number="form.retentionDays" type="number" step="1" required :min="snapshot.limits.retentionDays.minimum" :max="snapshot.limits.retentionDays.maximum">
          <small>Entre {{ snapshot.limits.retentionDays.minimum }} e {{ snapshot.limits.retentionDays.maximum }} dias.</small>
        </label>
        <label>Histórico de scripts
          <input v-model.number="form.scriptHistoryLimit" type="number" step="1" required :min="snapshot.limits.scriptHistoryLimit.minimum" :max="snapshot.limits.scriptHistoryLimit.maximum">
          <small>Entre {{ snapshot.limits.scriptHistoryLimit.minimum }} e {{ snapshot.limits.scriptHistoryLimit.maximum }} registros.</small>
        </label>
        <label>Histórico de testes
          <input v-model.number="form.testHistoryLimit" type="number" step="1" required :min="snapshot.limits.testHistoryLimit.minimum" :max="snapshot.limits.testHistoryLimit.maximum">
          <small>Entre {{ snapshot.limits.testHistoryLimit.minimum }} e {{ snapshot.limits.testHistoryLimit.maximum }} registros.</small>
        </label>
        <p class="settings-notice">Salvar não remove arquivos. Os novos valores passam a valer após reiniciar a API.</p>
        <button class="primary-button" type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar configurações' }}</button>
      </form>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <p v-if="feedback" class="success-message" role="status">{{ feedback }}</p>
    </Card>
  </section>
</template>
