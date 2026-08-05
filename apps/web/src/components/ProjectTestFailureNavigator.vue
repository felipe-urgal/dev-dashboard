<script setup lang="ts">
import {
  computed,
} from 'vue';
import {
  ArrowPathIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import {
  useRouter,
} from 'vue-router';

import type {
  Project,
  ProjectTestRunner,
  TestFailure,
} from '@dev-dashboard/contracts';

import { parseTestFailures } from '../composables/project-test-failures';

const props = defineProps<{
  project: Project;
  runner: ProjectTestRunner;
  logContent: string;
  running: boolean;
}>();

const emit = defineEmits<{
  'repeat-file': [path: string];
}>();

const router = useRouter();

const failures = computed(() => parseTestFailures(
  props.logContent,
  props.runner,
  {
    projectPath: props.project.path,
    limit: 20,
  },
));

function locationLabel(failure: TestFailure): string {
  const location = failure.location;
  if (!location) return 'Local não identificado';
  const suffix = [location.line, location.column]
    .filter((value) => value !== undefined)
    .join(':');
  return suffix ? `${location.path}:${suffix}` : location.path;
}

async function openFailure(failure: TestFailure): Promise<void> {
  const location = failure.location;
  if (!location) return;

  await router.push({
    name: 'project-editor',
    params: { projectId: props.project.id },
    query: {
      file: location.path,
      ...(location.line ? { line: String(location.line) } : {}),
      ...(location.column ? { column: String(location.column) } : {}),
    },
  });
}
</script>

<template>
  <section
    v-if="failures.length"
    class="tests-failure-navigator"
    aria-labelledby="tests-failure-navigator-title"
  >
    <header class="tests-failure-navigator-header">
      <div>
        <span class="section-kicker">Falhas estruturadas</span>
        <h4 id="tests-failure-navigator-title">
          {{ failures.length }}
          {{ failures.length === 1 ? 'falha identificada' : 'falhas identificadas' }}
        </h4>
        <p>
          Abra a origem no editor ou execute apenas o arquivo relacionado.
          O log completo permanece disponível abaixo.
        </p>
      </div>
      <ExclamationTriangleIcon aria-hidden="true" />
    </header>

    <ol class="tests-failure-list">
      <li
        v-for="failure in failures"
        :key="failure.id"
        class="tests-failure-item"
      >
        <div class="tests-failure-copy">
          <strong>{{ failure.name }}</strong>
          <p>{{ failure.message }}</p>
          <code>{{ locationLabel(failure) }}</code>
        </div>

        <dl
          v-if="failure.expected || failure.actual"
          class="tests-failure-comparison"
        >
          <div v-if="failure.expected">
            <dt>Esperado</dt>
            <dd><code>{{ failure.expected }}</code></dd>
          </div>
          <div v-if="failure.actual">
            <dt>Obtido</dt>
            <dd><code>{{ failure.actual }}</code></dd>
          </div>
        </dl>

        <details v-if="failure.stack.length" class="tests-failure-stack">
          <summary>Ver rastreamento</summary>
          <ol>
            <li v-for="line in failure.stack" :key="line">
              <code>{{ line }}</code>
            </li>
          </ol>
        </details>

        <div class="tests-failure-actions">
          <button
            type="button"
            class="secondary-button tests-button-with-icon"
            :disabled="!failure.location"
            @click="openFailure(failure)"
          >
            <CodeBracketIcon aria-hidden="true" />
            Abrir no editor
          </button>
          <button
            type="button"
            class="secondary-button tests-button-with-icon"
            :disabled="running || !failure.location"
            @click="failure.location && emit('repeat-file', failure.location.path)"
          >
            <ArrowPathIcon aria-hidden="true" />
            Executar arquivo
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>
