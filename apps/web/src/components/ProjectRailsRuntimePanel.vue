<script setup lang="ts">
import {
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { watch } from 'vue';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import ProjectLogTerminal from './ProjectLogTerminal.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project; workerId: RailsWorkerId }>();

const worker = useProjectRailsWorker(
  () => props.project,
  props.workerId,
  props.workerId === 'sidekiq',
);

useAutoDismiss(worker.errorMessage, '');

watch(
  () =>
    [
      props.project.id,
      worker.detected.value,
      worker.canStop.value,
    ] as const,
  ([, detected, canFollowLogs]) => {
    if (detected && canFollowLogs) {
      worker.startLogStream();
    } else if (!canFollowLogs) {
      worker.stopLogStream();
    }
  },
);

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'webpack-dev-server',
};

const supportsRestart = props.workerId === 'sidekiq';

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}
</script>

<template>
  <div class="rails-runtime-panel">
    <section
      class="rails-worker-panel"
      :data-worker-id="workerId"
      aria-label="Estado do processo"
    >
      <Card class="rails-worker-card">
        <p
          v-if="worker.errorMessage.value"
          class="rails-worker-error"
          role="alert"
        >
          {{ worker.errorMessage.value }}
        </p>

        <p
          v-if="worker.loading.value && !worker.detected.value"
          class="rails-worker-empty"
        >
          Verificando se {{ workerLabels[workerId] }} está disponível no
          projeto…
        </p>

        <div
          v-else-if="!worker.detected.value"
          class="rails-worker-empty-state"
        >
          <strong>{{ workerLabels[workerId] }} não foi detectado.</strong>
          <p>
            O painel será habilitado automaticamente quando o projeto possuir a
            dependência ou o binstub correspondente.
          </p>
        </div>

        <template v-else>
          <section
            class="rails-worker-overview"
            aria-label="Estado do processo"
          >
            <div class="rails-worker-overview-main">
              <strong class="rails-worker-status-copy">
                {{
                  worker.canStop.value
                    ? 'Processo ativo e respondendo.'
                    : 'Processo parado.'
                }}
              </strong>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{{ worker.statusLabel.value }}</dd>
                </div>
                <div>
                  <dt>PID</dt>
                  <dd>{{ worker.managedProcess.value?.pid ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Iniciado em</dt>
                  <dd>
                    {{ formatDate(worker.managedProcess.value?.startedAt) }}
                  </dd>
                </div>
                <div class="rails-worker-command">
                  <dt>Comando</dt>
                  <dd>
                    <code>{{
                      worker.managedProcess.value?.command ??
                      'Ainda não iniciado pelo dashboard'
                    }}</code>
                  </dd>
                </div>
              </dl>
            </div>

            <div class="rails-worker-actions">
              <button
                type="button"
                class="secondary-button"
                @click="worker.toggleLogs()"
              >
                Ver log
              </button>
              <button
                v-if="!wUsage: prettier [options] [file/dir/glob ...]

By default, output is written to stdout.
Stdin is read if it is piped to Prettier and no files are given.

Output options:

  -c, --check              Check if the given files are formatted, print a human-friendly summary
                           message and paths to unformatted files (see also --list-different).
  -l, --list-different     Print the names of files that are different from Prettier's formatting (see also --check).
  -w, --write              Edit files in-place. (Beware!)

Format options:

  --arrow-parens <always|avoid>
                           Include parentheses around a sole arrow function parameter.
                           Defaults to always.
  --bracket-same-line      Put > of opening tags on the last line instead of on a new line.
                           Defaults to false.
  --no-bracket-spacing     Do not print spaces between brackets.
  --embedded-language-formatting <auto|off>
                           Control how Prettier formats quoted code embedded in the file.
                           Defaults to auto.
  --end-of-line <lf|crlf|cr|auto>
                           Which end of line characters to apply.
                           Defaults to lf.
  --experimental-operator-position <start|end>
                           Where to print operators when binary expressions wrap lines.
                           Defaults to end.
  --no-experimental-ternaries
                           Default behavior of ternaries; keep question marks on the same line as the consequent.
  --html-whitespace-sensitivity <css|strict|ignore>
                           How to handle whitespaces in HTML.
                           Defaults to css.
  --jsx-single-quote       Use single quotes in JSX.
                           Defaults to false.
  --object-wrap <preserve|collapse>
                           How to wrap object literals.
                           Defaults to preserve.
  --parser <flow|babel|babel-flow|babel-ts|typescript|acorn|espree|meriyah|css|less|scss|json|json5|jsonc|json-stringify|graphql|markdown|mdx|vue|yaml|glimmer|html|angular|lwc|mjml>
                           Which parser to use.
  --print-width <int>      The line length where Prettier will try wrap.
                           Defaults to 80.
  --prose-wrap <always|never|preserve>
                           How to wrap prose.
                           Defaults to preserve.
  --quote-props <as-needed|consistent|preserve>
                           Change when properties in objects are quoted.
                           Defaults to as-needed.
  --no-semi                Do not print semicolons, except at the beginning of lines which may need them.
  --single-attribute-per-line
                           Enforce single attribute per line in HTML, Vue and JSX.
                           Defaults to false.
  --single-quote           Use single quotes instead of double quotes.
                           Defaults to false.
  --tab-width <int>        Number of spaces per indentation level.
                           Defaults to 2.
  --trailing-comma <all|es5|none>
                           Print trailing commas wherever possible when multi-line.
                           Defaults to all.
  --use-tabs               Indent with tabs instead of spaces.
                           Defaults to false.
  --vue-indent-script-and-style
                           Indent script and style tags in Vue files.
                           Defaults to false.

Config options:

  --config <path>          Path to a Prettier configuration file (.prettierrc, package.json, prettier.config.js).
  --no-config              Do not look for a configuration file.
  --config-precedence <cli-override|file-override|prefer-file>
                           Define in which order config files and CLI options should be evaluated.
                           Defaults to cli-override.
  --no-editorconfig        Don't take .editorconfig into account when parsing configuration.
  --find-config-path <path>
                           Find and print the path to a configuration file for the given input file.
  --ignore-path <path>     Path to a file with patterns describing files to ignore.
                           Multiple values are accepted.
                           Defaults to [.gitignore, .prettierignore].
  --plugin <path>          Add a plugin. Multiple plugins can be passed as separate `--plugin`s.
                           Defaults to [].
  --with-node-modules      Process files inside 'node_modules' directory.

Editor options:

  --cursor-offset <int>    Print (to stderr) where a cursor at the given position would move to after formatting.
                           Defaults to -1.
  --range-end <int>        Format code ending at a given character offset (exclusive).
                           The range will extend forwards to the end of the selected statement.
                           Defaults to Infinity.
  --range-start <int>      Format code starting at a given character offset.
                           The range will extend backwards to the start of the first line containing the selected statement.
                           Defaults to 0.

Other options:

  --cache                  Only format changed files. Cannot use with --stdin-filepath.
                           Defaults to false.
  --cache-location <path>  Path to the cache file.
  --cache-strategy <metadata|content>
                           Strategy for the cache to use for detecting changed files.
  --check-ignore-pragma    Check whether the file's first docblock comment contains '@noprettier' or '@noformat' to determine if it should be formatted.
                           Defaults to false.
  --no-color               Do not colorize error messages.
  --no-error-on-unmatched-pattern
                           Prevent errors when pattern is unmatched.
  --file-info <path>       Extract the following info (as JSON) for a given file path. Reported fields:
                           * ignored (boolean) - true if file path is filtered by --ignore-path
                           * inferredParser (string | null) - name of parser inferred from file path
  -h, --help <flag>        Show CLI usage, or details about the given flag.
                           Example: --help write
  -u, --ignore-unknown     Ignore unknown files.
  --insert-pragma          Insert @format pragma into file's first docblock comment.
                           Defaults to false.
  --log-level <silent|error|warn|log|debug>
                           What level of logs to report.
                           Defaults to log.
  --require-pragma         Require either '@prettier' or '@format' to be present in the file's first docblock comment in order for it to be formatted.
                           Defaults to false.
  --stdin-filepath <path>  Path to the file to pretend that stdin comes from.
  --support-info           Print support information as JSON.
  -v, --version            Print Prettier version.


npm notice
npm notice New major version of npm available! 11.9.0 -> 12.0.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.2
npm notice To update run: npm install -g npm@12.0.2
npm notice
