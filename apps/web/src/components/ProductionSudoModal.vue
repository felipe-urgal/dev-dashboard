<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import {
  KeyIcon,
  LockClosedIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import {
  authorizeDeploymentSudo,
  fetchDeploymentSudoStatus,
} from '../api';

interface Props {
  open: boolean;
  projectId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  authorized: [];
}>();

const password = ref('');
const errorMessage = ref('');
const checking = ref(false);
const submitting = ref(false);

function clearSecret(): void {
  password.value = '';
}

function close(): void {
  if (submitting.value) return;
  clearSecret();
  errorMessage.value = '';
  emit('close');
}

async function checkExistingAuthorization(): Promise<void> {
  checking.value = true;
  errorMessage.value = '';
  try {
    const status = await fetchDeploymentSudoStatus(props.projectId);
    if (status.authorized) {
      clearSecret();
      emit('authorized');
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar a autorização do sudo.';
  } finally {
    checking.value = false;
  }
}

async function authorize(): Promise<void> {
  if (!password.value || submitting.value) return;
  submitting.value = true;
  errorMessage.value = '';
  try {
    const status = await authorizeDeploymentSudo(
      props.projectId,
      password.value,
    );
    if (!status.authorized) {
      errorMessage.value = 'O sudo não ficou autorizado para uso não interativo.';
      return;
    }
    clearSecret();
    emit('authorized');
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível autorizar o sudo.';
  } finally {
    clearSecret();
    submitting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    clearSecret();
    errorMessage.value = '';
    if (open) void checkExistingAuthorization();
  },
);

onBeforeUnmount(clearSecret);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sudo-modal-backdrop"
      role="presentation"
      @click.self="close"
    >
      <section
        class="sudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sudo-modal-title"
      >
        <header>
          <div class="sudo-modal-icon" aria-hidden="true">
            <LockClosedIcon />
          </div>
          <div>
            <span>Permissão local</span>
            <h3 id="sudo-modal-title">Autorizar sudo temporariamente</h3>
          </div>
          <button
            class="sudo-modal-close"
            type="button"
            aria-label="Fechar"
            :disabled="submitting"
            @click="close"
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>

        <p class="sudo-modal-description">
          O deployment foi bloqueado porque um comando precisa de sudo. A senha
          é enviada somente para a API local para executar
          <code>sudo -S -v</code>; ela não é salva no projeto nem no estado do
          dashboard.
        </p>

        <form @submit.prevent="authorize">
          <label for="production-sudo-password">Senha do sudo</label>
          <div class="sudo-password-field">
            <KeyIcon aria-hidden="true" />
            <input
              id="production-sudo-password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              :disabled="checking || submitting"
              autofocus
            />
          </div>

          <div v-if="errorMessage" class="sudo-modal-error" role="alert">
            {{ errorMessage }}
          </div>

          <p class="sudo-modal-note">
            Por segurança, esta autorização só funciona quando o dashboard é
            acessado diretamente pelo host local. Se a política sudoers não
            permitir reutilizar o ticket sem TTY, o dashboard vai informar que
            é necessária uma regra NOPASSWD limitada.
          </p>

          <footer>
            <button
              class="sudo-secondary-button"
              type="button"
              :disabled="submitting"
              @click="close"
            >
              Cancelar
            </button>
            <button
              class="sudo-primary-button"
              type="submit"
              :disabled="checking || submitting || !password"
            >
              {{
                checking
                  ? 'Verificando…'
                  : submitting
                    ? 'Autorizando…'
                    : 'Autorizar sudo'
              }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sudo-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(2 12 20 / 72%);
  backdrop-filter: blur(4px);
}

.sudo-modal {
  width: min(520px, 100%);
  border: 1px solid var(--border-color, #24445a);
  border-radius: 12px;
  background: var(--surface-color, #0b1d29);
  color: var(--text-color, #e8f4fa);
  box-shadow: 0 24px 80px rgb(0 0 0 / 38%);
}

.sudo-modal > header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color, #24445a);
}

.sudo-modal header span,
.sudo-modal label {
  color: var(--muted-color, #82a8bd);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sudo-modal h3 {
  margin: 3px 0 0;
  font-size: 18px;
}

.sudo-modal-icon,
.sudo-modal-close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
}

.sudo-modal-icon {
  border-radius: 9px;
  background: rgb(27 194 229 / 12%);
  color: #29d3ef;
}

.sudo-modal-icon svg,
.sudo-modal-close svg,
.sudo-password-field svg {
  width: 18px;
  height: 18px;
}

.sudo-modal-close {
  border: 0;
  background: transparent;
  color: var(--muted-color, #82a8bd);
  cursor: pointer;
}

.sudo-modal-description,
.sudo-modal form {
  margin: 0;
  padding: 18px 20px 0;
}

.sudo-modal-description {
  color: var(--muted-color, #a5bfcd);
  line-height: 1.55;
}

.sudo-modal code {
  color: #68d8f4;
}

.sudo-password-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-color, #315369);
  border-radius: 8px;
  background: rgb(2 16 26 / 55%);
}

.sudo-password-field svg {
  flex: 0 0 auto;
  color: var(--muted-color, #82a8bd);
}

.sudo-password-field input {
  width: 100%;
  padding: 11px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.sudo-modal-error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgb(255 93 115 / 35%);
  border-radius: 8px;
  background: rgb(255 70 95 / 10%);
  color: #ff8a9b;
  line-height: 1.4;
}

.sudo-modal-note {
  margin: 12px 0 0;
  color: var(--muted-color, #82a8bd);
  font-size: 12px;
  line-height: 1.5;
}

.sudo-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 18px -20px 0;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color, #24445a);
}

.sudo-primary-button,
.sudo-secondary-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 7px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.sudo-primary-button {
  border: 1px solid #22c7e6;
  background: #0c5d72;
  color: #eafcff;
}

.sudo-secondary-button {
  border: 1px solid var(--border-color, #315369);
  background: transparent;
  color: var(--text-color, #d8e8ef);
}

.sudo-primary-button:disabled,
.sudo-secondary-button:disabled,
.sudo-modal-close:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
