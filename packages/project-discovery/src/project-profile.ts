import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DetectedCapability,
  DetectionEvidence,
  Project,
  ProjectProfile,
  ProjectProfileProvider,
  ProjectProfileProviderContext,
} from '@dev-dashboard/contracts';

async function exists(projectPath: string, relativePath: string): Promise<boolean> {
  try {
    await access(path.join(projectPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function hasYamlFile(
  projectPath: string,
  relativePath: string,
): Promise<boolean> {
  try {
    const entries = await readdir(path.join(projectPath, relativePath), {
      withFileTypes: true,
    });
    return entries.some(
      (entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name),
    );
  } catch {
    return false;
  }
}

async function readText(
  projectPath: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await readFile(path.join(projectPath, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readPackageJson(
  projectPath: string,
): Promise<Record<string, unknown> | null> {
  const contents = await readText(projectPath, 'package.json');
  if (!contents) return null;
  try {
    return asRecord(JSON.parse(contents) as unknown);
  } catch {
    return null;
  }
}

function capability(
  id: string,
  provider: string,
  evidence: DetectionEvidence[],
  metadata?: DetectedCapability['metadata'],
): DetectedCapability {
  return {
    id,
    provider,
    confidence: 'certain',
    evidence,
    ...(metadata ? { metadata } : {}),
  };
}

const runtimeProvider: ProjectProfileProvider = {
  id: 'runtime',
  async detect(context) {
    const detected: DetectedCapability[] = [];
    const nodeFiles = ['.nvmrc', '.node-version'];
    for (const file of nodeFiles) {
      const value = (await readText(context.projectPath, file))?.trim();
      if (!value) continue;
      detected.push(
        capability(
          'runtime/node',
          this.id,
          [{ kind: 'file', source: file }],
          { declaredVersion: value },
        ),
      );
      break;
    }

    const packageJson = await readPackageJson(context.projectPath);
    const engines = asRecord(packageJson?.engines);
    const engineNode = engines?.node;
    if (
      !detected.some((entry) => entry.id === 'runtime/node') &&
      typeof engineNode === 'string'
    ) {
      detected.push(
        capability(
          'runtime/node',
          this.id,
          [{ kind: 'manifest', source: 'package.json', detail: 'engines.node' }],
          { declaredVersion: engineNode },
        ),
      );
    }

    const rubyVersion = (
      await readText(context.projectPath, '.ruby-version')
    )?.trim();
    if (rubyVersion) {
      detected.push(
        capability(
          'runtime/ruby',
          this.id,
          [{ kind: 'file', source: '.ruby-version' }],
          { declaredVersion: rubyVersion },
        ),
      );
    } else if (context.projectType === 'rails') {
      detected.push({
        id: 'runtime/ruby',
        provider: this.id,
        confidence: 'strong',
        evidence: [{ kind: 'config', source: 'project-type', detail: 'rails' }],
      });
    }

    return detected;
  },
};

const packageManagerProvider: ProjectProfileProvider = {
  id: 'package-manager',
  async detect(context) {
    const packageJson = await readPackageJson(context.projectPath);
    const declared = packageJson?.packageManager;
    if (typeof declared === 'string' && declared.trim()) {
      const [name, version] = declared.trim().split('@');
      if (name) {
        return [
          capability(
            `package-manager/${name}`,
            this.id,
            [
              {
                kind: 'manifest',
                source: 'package.json',
                detail: 'packageManager',
              },
            ],
            version ? { declaredVersion: version } : undefined,
          ),
        ];
      }
    }

    const lockfiles = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['bun.lockb', 'bun'],
      ['bun.lock', 'bun'],
      ['package-lock.json', 'npm'],
      ['Gemfile.lock', 'bundler'],
    ] as const;
    for (const [file, manager] of lockfiles) {
      if (await exists(context.projectPath, file)) {
        return [
          capability(`package-manager/${manager}`, this.id, [
            { kind: 'file', source: file },
          ]),
        ];
      }
    }
    return [];
  },
};

const frameworkProvider: ProjectProfileProvider = {
  id: 'framework',
  async detect(context) {
    const detected: DetectedCapability[] = [];
    const packageJson = await readPackageJson(context.projectPath);
    const dependencies = {
      ...asRecord(packageJson?.dependencies),
      ...asRecord(packageJson?.devDependencies),
    };
    const candidates = [
      ['next', 'framework/next'],
      ['vite', 'framework/vite'],
      ['fastify', 'framework/fastify'],
      ['turbo', 'framework/turbo'],
    ] as const;
    for (const [dependency, id] of candidates) {
      if (typeof dependencies[dependency] !== 'string') continue;
      detected.push(
        capability(id, this.id, [
          {
            kind: 'manifest',
            source: 'package.json',
            detail: dependency,
          },
        ]),
      );
    }

    if (context.projectType === 'rails') {
      detected.push({
        id: 'framework/rails',
        provider: this.id,
        confidence: 'certain',
        evidence: [{ kind: 'config', source: 'project-type', detail: 'rails' }],
      });
    }
    return detected;
  },
};

const containerProvider: ProjectProfileProvider = {
  id: 'container',
  async detect(context) {
    const detected: DetectedCapability[] = [];
    if (await exists(context.projectPath, 'Dockerfile')) {
      detected.push(
        capability('container/docker', this.id, [
          { kind: 'file', source: 'Dockerfile' },
        ]),
      );
    }

    for (const file of [
      'compose.yml',
      'compose.yaml',
      'docker-compose.yml',
      'docker-compose.yaml',
    ]) {
      if (!(await exists(context.projectPath, file))) continue;
      detected.push(
        capability('container/compose', this.id, [
          { kind: 'file', source: file },
        ]),
      );
      break;
    }

    if (await exists(context.projectPath, '.devcontainer/devcontainer.json')) {
      detected.push(
        capability('container/devcontainer', this.id, [
          { kind: 'file', source: '.devcontainer/devcontainer.json' },
        ]),
      );
    }
    return detected;
  },
};

const ciProvider: ProjectProfileProvider = {
  id: 'ci',
  async detect(context) {
    const detected: DetectedCapability[] = [];
    if (await hasYamlFile(context.projectPath, '.github/workflows')) {
      detected.push(
        capability('ci/github-actions', this.id, [
          { kind: 'config', source: '.github/workflows' },
        ]),
      );
    }
    if (await exists(context.projectPath, '.gitlab-ci.yml')) {
      detected.push(
        capability('ci/gitlab', this.id, [
          { kind: 'file', source: '.gitlab-ci.yml' },
        ]),
      );
    }
    return detected;
  },
};

const environmentProvider: ProjectProfileProvider = {
  id: 'environment',
  async detect(context) {
    const files = [
      '.env.example',
      '.env.sample',
      '.env.production.example',
      '.env.docker.example',
      '.env.docker.sample',
    ];
    const evidence: DetectionEvidence[] = [];
    for (const file of files) {
      if (await exists(context.projectPath, file)) {
        evidence.push({ kind: 'file', source: file });
      }
    }
    if (evidence.length === 0) return [];
    return [
      capability('environment/contract-files', this.id, evidence, {
        files: evidence.map((entry) => entry.source),
      }),
    ];
  },
};

export const DEFAULT_PROJECT_PROFILE_PROVIDERS: readonly ProjectProfileProvider[] = [
  runtimeProvider,
  packageManagerProvider,
  frameworkProvider,
  containerProvider,
  ciProvider,
  environmentProvider,
];

export async function detectProjectProfile(
  context: ProjectProfileProviderContext,
  providers: readonly ProjectProfileProvider[] = DEFAULT_PROJECT_PROFILE_PROVIDERS,
): Promise<ProjectProfile> {
  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider: provider.id,
      capabilities: await provider.detect(context),
    })),
  );

  const capabilities: DetectedCapability[] = [];
  const diagnostics: ProjectProfile['diagnostics'] = [];

  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === 'fulfilled') {
      capabilities.push(...result.value.capabilities);
      return;
    }
    diagnostics.push({
      provider: provider?.id ?? 'unknown',
      message: 'Provider de profile falhou durante a detecção.',
    });
  });

  capabilities.sort((left, right) => left.id.localeCompare(right.id));
  return { capabilities, diagnostics };
}

export async function enrichProjectProfile(project: Project): Promise<Project> {
  return {
    ...project,
    profile: await detectProjectProfile({
      projectPath: project.path,
      projectType: project.type,
    }),
  };
}
