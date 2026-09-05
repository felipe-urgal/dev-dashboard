import type {
  AttentionItem,
  AttentionUnavailableSource,
  ManagedProcess,
  ProductionOverview,
  Project,
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
  WorkspaceAttention,
} from '@dev-dashboard/contracts';

export interface AttentionProcessReader {
  listProcesses(): Promise<ManagedProcess[]>;
}

export interface AttentionGitReader {
  getOverview(projectPath: string): Promise<ProjectGitOverview>;
}

export interface AttentionTestHistoryReader {
  history(
    projectId: string,
    page?: number,
    pageSize?: number,
  ): Promise<TestExecutionHistory>;
}

export interface AttentionDoctorReader {
  getReport(project: Project): Promise<ProjectDiagnosticReport>;
}

export interface AttentionProductionReader {
  read(projects: readonly Project[]): Promise<ProductionOverview>;
}

export interface AttentionCenterServiceOptions {
  processReader: AttentionProcessReader;
  gitReader: AttentionGitReader;
  testHistoryReader: AttentionTestHistoryReader;
  doctorReader: AttentionDoctorReader;
  productionReader: AttentionProductionReader;
  now?: () => number;
}

function projectById(projects: readonly Project[]): Map<string, Project> {
  return new Map(projects.map((project) => [project.id, project]));
}

function processAttentionItems(
  processes: readonly ManagedProcess[],
  projects: readonly Project[],
  fallbackObservedAt: string,
): AttentionItem[] {
  const projectsIndex = projectById(projects);
  const items: AttentionItem[] = [];

  for (const process of processes) {
    const project = projectsIndex.get(process.projectId);
    if (!project) continue;

    const failed = process.status === 'failed';
    const abnormalStop =
      process.status === 'stopped' &&
      process.exitCode !== undefined &&
      process.exitCode !== 0;
    if (!failed && !abnormalStop) continue;

    items.push({
      id: `process:${project.id}:${process.id}`,
      projectId: project.id,
      projectName: project.name,
      category: 'process',
      severity: 'critical',
      message: failed
        ? `Processo ${process.kind} falhou.`
        : `Processo ${process.kind} encerrou com código ${process.exitCode}.`,
      observedAt: process.stoppedAt ?? fallbackObservedAt,
      action: { destination: 'processes' },
    });
  }

  return items;
}

function gitAttentionItem(
  project: Project,
  overview: ProjectGitOverview,
  observedAt: string,
): AttentionItem | null {
  if (!overview.repository) return null;

  const divergent = overview.ahead > 0 && overview.behind > 0;
  const dirty = !overview.clean;
  const behind = overview.behind > 0;
  if (!divergent && !dirty && !behind) return null;

  const branch = overview.branch ?? 'branch atual';
  const details: string[] = [];
  if (divergent) {
    details.push(
      `${branch} divergiu (${overview.ahead} à frente, ${overview.behind} atrás)`,
    );
  } else if (behind) {
    details.push(`${branch} está ${overview.behind} commit(s) atrás`);
  }
  if (dirty) {
    details.push(`${overview.files.length} alteração(ões) local(is)`);
  }

  return {
    id: `git:${project.id}`,
    projectId: project.id,
    projectName: project.name,
    category: 'git',
    severity: divergent ? 'critical' : 'warning',
    message: `${details.join(' e ')}.`,
    observedAt,
    action: { destination: 'git', projectId: project.id },
  };
}

function testAttentionItem(
  project: Project,
  history: TestExecutionHistory,
  fallbackObservedAt: string,
): AttentionItem | null {
  const latest = history.items[0];
  if (!latest) return null;

  const failed =
    latest.status === 'failed' ||
    (latest.status === 'stopped' &&
      latest.exitCode !== undefined &&
      latest.exitCode !== 0);
  if (!failed) return null;

  return {
    id: `test:${project.id}:${latest.id}`,
    projectId: project.id,
    projectName: project.name,
    category: 'test',
    severity: 'critical',
    message: 'A última execução de testes falhou.',
    observedAt: latest.finishedAt ?? latest.startedAt ?? fallbackObservedAt,
    action: { destination: 'tests', projectId: project.id },
  };
}

function doctorAttentionItem(
  project: Project,
  report: ProjectDiagnosticReport,
): AttentionItem | null {
  if (report.overallStatus !== 'blocked') return null;

  return {
    id: `doctor:${project.id}`,
    projectId: project.id,
    projectName: project.name,
    category: 'doctor',
    severity: 'critical',
    message: `Project Doctor encontrou ${report.summary.failed} verificação(ões) com falha.`,
    observedAt: report.generatedAt,
    action: { destination: 'doctor', projectId: project.id },
  };
}

function productionAttentionItems(
  overview: ProductionOverview,
  projects: readonly Project[],
): AttentionItem[] {
  const projectsIndex = projectById(projects);
  const items: AttentionItem[] = [];

  for (const production of overview.items) {
    const project = projectsIndex.get(production.projectId);
    if (!project) continue;

    if (
      production.state !== 'recovery-required' &&
      production.state !== 'failed'
    ) {
      continue;
    }

    items.push({
      id: `production:${project.id}:${production.deploymentId ?? production.state}`,
      projectId: project.id,
      projectName: project.name,
      category: 'production',
      severity: 'critical',
      message:
        production.state === 'recovery-required'
          ? 'Produção requer recovery antes de uma nova operação.'
          : 'A última operação de produção falhou.',
      observedAt: production.healthCheckedAt ?? overview.generatedAt,
      action: { destination: 'production', projectId: project.id },
    });
  }

  return items;
}

function pushUnavailable(
  unavailable: AttentionUnavailableSource[],
  source: AttentionUnavailableSource,
): void {
  if (
    unavailable.some(
      (entry) =>
        entry.category === source.category &&
        entry.projectId === source.projectId,
    )
  ) {
    return;
  }
  unavailable.push(source);
}

function sortItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'critical' ? -1 : 1;
    }
    const projectOrder = left.projectName.localeCompare(right.projectName);
    if (projectOrder !== 0) return projectOrder;
    return left.category.localeCompare(right.category);
  });
}

function sortUnavailableSources(
  sources: AttentionUnavailableSource[],
): AttentionUnavailableSource[] {
  return [...sources].sort((left, right) => {
    const categoryOrder = left.category.localeCompare(right.category);
    if (categoryOrder !== 0) return categoryOrder;
    return (left.projectId ?? '').localeCompare(right.projectId ?? '');
  });
}

export class AttentionCenterService {
  private readonly now: () => number;

  public constructor(private readonly options: AttentionCenterServiceOptions) {
    this.now = options.now ?? Date.now;
  }

  public async read(
    workspaceId: string,
    projects: readonly Project[],
  ): Promise<WorkspaceAttention> {
    const generatedAt = new Date(this.now()).toISOString();
    const enabledProjects = projects.filter((project) => project.enabled);
    const items: AttentionItem[] = [];
    const unavailableSources: AttentionUnavailableSource[] = [];

    const [processResult, productionResult] = await Promise.allSettled([
      this.options.processReader.listProcesses(),
      this.options.productionReader.read(enabledProjects),
    ]);

    if (processResult.status === 'fulfilled') {
      items.push(
        ...processAttentionItems(
          processResult.value,
          enabledProjects,
          generatedAt,
        ),
      );
    } else {
      pushUnavailable(unavailableSources, { category: 'process' });
    }

    if (productionResult.status === 'fulfilled') {
      items.push(
        ...productionAttentionItems(productionResult.value, enabledProjects),
      );
    } else {
      pushUnavailable(unavailableSources, { category: 'production' });
    }

    await Promise.all(
      enabledProjects.map(async (project) => {
        const [gitResult, testResult, doctorResult] = await Promise.allSettled([
          this.options.gitReader.getOverview(project.path),
          this.options.testHistoryReader.history(project.id, 1, 1),
          this.options.doctorReader.getReport(project),
        ]);

        if (gitResult.status === 'fulfilled') {
          const item = gitAttentionItem(project, gitResult.value, generatedAt);
          if (item) items.push(item);
        } else {
          pushUnavailable(unavailableSources, {
            category: 'git',
            projectId: project.id,
          });
        }

        if (testResult.status === 'fulfilled') {
          const item = testAttentionItem(
            project,
            testResult.value,
            generatedAt,
          );
          if (item) items.push(item);
        } else {
          pushUnavailable(unavailableSources, {
            category: 'test',
            projectId: project.id,
          });
        }

        if (doctorResult.status === 'fulfilled') {
          const item = doctorAttentionItem(project, doctorResult.value);
          if (item) items.push(item);
        } else {
          pushUnavailable(unavailableSources, {
            category: 'doctor',
            projectId: project.id,
          });
        }
      }),
    );

    return {
      workspaceId,
      generatedAt,
      partial: unavailableSources.length > 0,
      unavailableSources: sortUnavailableSources(unavailableSources),
      items: sortItems(items),
    };
  }
}
