import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { pathExists } from './fs-helpers.js';
import type { DetectedTestCommand } from './types.js';

export async function detectPythonCommands(
  project: Project,
): Promise<DetectedTestCommand[]> {
  // Só oferece pytest se houver sinal explícito de Python + pytest.
  const hasPytestIni = await pathExists(
    path.join(project.path, 'pytest.ini'),
  );
  const hasConftest = await pathExists(
    path.join(project.path, 'conftest.py'),
  );

  let pyprojectDeclaresPytest = false;
  try {
    const pyproject = await readFile(
      path.join(project.path, 'pyproject.toml'),
      'utf8',
    );
    pyprojectDeclaresPytest =
      /\[tool\.pytest(\.[a-z_]+)?\]/i.test(pyproject) ||
      /(^|\s)pytest(\s*[><=~!]|\s*$)/im.test(pyproject);
  } catch {
    // pyproject.toml ausente ou ilegível
  }

  let requirementsDeclaresPytest = false;
  for (const candidate of [
    'requirements.txt',
    'requirements-dev.txt',
    'dev-requirements.txt',
  ]) {
    try {
      const contents = await readFile(
        path.join(project.path, candidate),
        'utf8',
      );
      if (/(^|\s)pytest(\s|$|[><=~!])/im.test(contents)) {
        requirementsDeclaresPytest = true;
        break;
      }
    } catch {
      // arquivo ausente
    }
  }

  const supported =
    hasPytestIni ||
    hasConftest ||
    pyprojectDeclaresPytest ||
    requirementsDeclaresPytest;

  if (!supported) {
    return [];
  }

  const originDetail = hasPytestIni
    ? 'pytest.ini'
    : hasConftest
      ? 'conftest.py'
      : pyprojectDeclaresPytest
        ? 'pyproject.toml'
        : 'requirements*.txt';

  return [
    {
      id: 'python-pytest',
      runner: 'pytest',
      label: 'pytest',
      description: 'Executa o pytest na raiz do projeto.',
      origin: hasPytestIni || pyprojectDeclaresPytest
        ? 'python-config'
        : 'directory',
      originDetail,
      priority: 40,
      resolved: { command: 'pytest', args: [] },
    },
  ];
}
