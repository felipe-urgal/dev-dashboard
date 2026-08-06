import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import process from 'node:process';

// Delimitadores improváveis de aparecer em mensagens de commit reais, usados
// para separar hash/data/assunto de forma robusta a assuntos com vírgula,
// aspas, etc.
const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

const TASK_PATTERN = /\btasks?\s+(\d+)/i;
const PR_PATTERN = /\(#(\d+)\)\s*$/;

export function runGitLog(options = {}) {
  const exec = options.execFn ?? execFileSync;
  const format = ['%H', '%ad', '%s'].join(FIELD_SEP) + RECORD_SEP;
  const output = exec(
    'git',
    ['log', `--date=short`, `--pretty=format:${format}`],
    { cwd: options.cwd ?? process.cwd(), encoding: 'utf8' },
  );
  return output;
}

export function parseGitLog(rawOutput) {
  return rawOutput
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, date, subject] = record.split(FIELD_SEP);
      return { hash, date, subject: subject ?? '' };
    });
}

// Extrai "Task NNN" (ou "Tasks NNN..." em mensagens que citam mais de uma) do
// assunto do commit. Retorna null quando o commit não referencia task
// nenhuma — nesses casos o agrupamento cai para a data.
export function extractTaskLabel(subject) {
  const match = subject.match(TASK_PATTERN);
  if (!match) return null;
  return `Task ${match[1]}`;
}

export function extractPrNumber(subject) {
  const match = subject.match(PR_PATTERN);
  return match ? match[1] : null;
}

// Agrupa commits consecutivos (na ordem de `git log`, do mais novo ao mais
// antigo) sob a mesma chave: número de task quando o assunto referencia uma,
// senão a data (YYYY-MM-DD). Commits do mesmo dia sem task viram um grupo por
// data; uma sequência de commits da mesma task vira um grupo só, mesmo que
// atravesse mais de um dia — isso reflete como o histórico deste repo é
// escrito na prática (ver `git log --oneline`).
export function groupCommits(commits) {
  const groups = [];
  let current = null;

  for (const commit of commits) {
    const taskLabel = extractTaskLabel(commit.subject);
    const key = taskLabel ?? commit.date;
    const heading = taskLabel ?? commit.date;

    if (!current || current.key !== key) {
      current = {
        key,
        heading,
        kind: taskLabel ? 'task' : 'date',
        commits: [],
      };
      groups.push(current);
    }
    current.commits.push(commit);
  }

  return groups;
}

function formatCommitLine(commit) {
  const pr = extractPrNumber(commit.subject);
  const subject = pr
    ? commit.subject.slice(0, commit.subject.length - `(#${pr})`.length).trim()
    : commit.subject;
  const shortHash = commit.hash.slice(0, 7);
  const prSuffix = pr ? ` ([#${pr}](../../pull/${pr}))` : ` (\`${shortHash}\`)`;
  return `- ${subject}${prSuffix}`;
}

function formatGroupHeading(group) {
  return `### ${group.heading}`;
}

const HEADER = `# Changelog

Gerado automaticamente por \`scripts/generate-changelog.mjs\` a partir de
\`git log\` — não edite manualmente, rode \`npm run changelog\` para
regenerar. Regenerar reescreve o arquivo inteiro a partir do histórico
completo do branch atual (não é um append incremental).

Commits são agrupados por "Task NNN" quando o assunto referencia uma task
numerada (convenção deste repo, ver \`tasks/\`); commits sem task
numerada são agrupados por data. A ordem segue o histórico do Git, do mais
recente para o mais antigo.

Isto cobre só a parte de **changelog** do item "Automatizar changelog,
release e tags de versão" de \`tasks/PENDENCIAS.md\`. Release e tags de
versão continuam pendentes de uma decisão de política de versionamento (o
projeto é \`"private": true\`) — ver o item correspondente em
\`tasks/PENDENCIAS.md\`.

`;

export function formatChangelog(groups, options = {}) {
  const header = options.header ?? HEADER;
  const sections = groups.map((group) => {
    const lines = group.commits.map(formatCommitLine);
    return `${formatGroupHeading(group)}\n\n${lines.join('\n')}\n`;
  });
  return `${header}${sections.join('\n')}`.trimEnd() + '\n';
}

export function generateChangelog(options = {}) {
  const rawOutput = options.rawOutput ?? runGitLog(options);
  const commits = parseGitLog(rawOutput);
  const groups = groupCommits(commits);
  return formatChangelog(groups, options);
}

export async function main() {
  const outputPath = new URL('../CHANGELOG.md', import.meta.url);
  const changelog = generateChangelog();
  writeFileSync(outputPath, changelog, 'utf8');
  console.log(
    `CHANGELOG.md atualizado (${changelog.split('\n').length} linhas).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  await main();
}
