import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import type { DoctorCommandRunner } from './check-types.js';
import { createDiagnosticCheck } from './check-types.js';

function hasCapability(project: Project, id: string): boolean {
  return (
    project.profile?.capabilities.some((capability) => capability.id === id) ??
    false
  );
}

function firstVersion(output: string): string | undefined {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

export function projectRequiresContainerToolchain(project: Project): boolean {
  return (
    hasCapability(project, 'container/docker') ||
    hasCapability(project, 'container/compose') ||
    hasCapability(project, 'container/devcontainer')
  );
}

export async function checkContainerToolchain(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const needsCompose = hasCapability(project, 'container/compose');
  const needsDocker = projectRequiresContainerToolchain(project);

  if (!needsDocker) {
    return createDiagnosticCheck({
      id: 'container-toolchain',
      category: 'runtime',
      label: 'Docker / Compose',
      status: 'skipped',
      summary:
        'O Project Profile não detectou uma capability de container para este projeto.',
    });
  }

  let dockerVersion: string | undefined;
  try {
    const result = await commandRunner('docker', ['--version']);
    dockerVersion = firstVersion(`${result.stdout}\n${result.stderr}`);
  } catch {
    return createDiagnosticCheck({
      id: 'container-toolchain',
      category: 'runtime',
      label: 'Docker / Compose',
      status: 'warning',
      summary: needsCompose
        ? 'Docker é necessário porque o Project Profile detectou Compose, mas o binário não está disponível para a API.'
        : 'O Project Profile detectou uso de container, mas Docker não está disponível para a API.',
      recommendation:
        'Disponibilize Docker no ambiente que executa o Dev Dashboard. O Doctor não instala nem altera a configuração global.',
    });
  }

  if (needsCompose) {
    let composeVersion: string | undefined;
    try {
      const result = await commandRunner('docker', ['compose', 'version']);
      composeVersion = firstVersion(`${result.stdout}\n${result.stderr}`);
    } catch {
      return createDiagnosticCheck({
        id: 'container-toolchain',
        category: 'runtime',
        label: 'Docker / Compose',
        status: 'warning',
        summary: `Docker${dockerVersion ? ` ${dockerVersion}` : ''} está disponível, mas o plugin Compose exigido pelo projeto não pôde ser executado.`,
        recommendation:
          'Disponibilize Docker Compose no mesmo ambiente da API antes de iniciar a stack do projeto.',
      });
    }

    try {
      await commandRunner('docker', ['info', '--format', '{{.ServerVersion}}']);
    } catch {
      return createDiagnosticCheck({
        id: 'container-toolchain',
        category: 'runtime',
        label: 'Docker / Compose',
        status: 'warning',
        summary: `Docker${dockerVersion ? ` ${dockerVersion}` : ''} e Compose${composeVersion ? ` ${composeVersion}` : ''} estão disponíveis, mas o daemon Docker não respondeu ao diagnóstico.`,
        recommendation:
          'Inicie ou disponibilize o daemon Docker e execute o Doctor novamente. Nenhuma operação de container foi iniciada pelo diagnóstico.',
      });
    }

    return createDiagnosticCheck({
      id: 'container-toolchain',
      category: 'runtime',
      label: 'Docker / Compose',
      status: 'passed',
      summary: `Docker${dockerVersion ? ` ${dockerVersion}` : ''}, Compose${composeVersion ? ` ${composeVersion}` : ''} e daemon estão disponíveis para a capability container/compose detectada pelo Project Profile.`,
    });
  }

  return createDiagnosticCheck({
    id: 'container-toolchain',
    category: 'runtime',
    label: 'Docker / Compose',
    status: 'passed',
    summary: `Docker${dockerVersion ? ` ${dockerVersion}` : ''} está disponível para a capability de container detectada pelo Project Profile.`,
  });
}
