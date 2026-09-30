import type {
  Stack,
  StackComposeServiceTarget,
  StackDependency,
  StackDependencyDiscovery,
  StackDependencyDiscoveryDiagnostic,
  StackDependencySuggestion,
  StackNode,
} from '@dev-dashboard/contracts';

import type { DevelopmentEnvironmentInstanceStore } from '../store/development-environment-instance-store.js';
import type { ProjectStore } from '../store/project-store.js';
import type { DockerComposeProvider } from './docker-compose-provider.js';
import type { StackDefinitionService } from './stack-definition-service.js';
import { resolveStackComposeProject } from './stack-compose-project-resolver.js';
import { StackTopologyService } from './stack-topology-service.js';

export class StackDependencyDiscoveryServiceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StackDependencyDiscoveryServiceError';
  }
}

type ComposeStackNode = StackNode & {
  target: StackComposeServiceTarget;
};

interface ComposeContext {
  key: string;
  projectId: string;
  environmentInstanceId: string;
  nodes: ComposeStackNode[];
}

function dependencyKey(dependency: StackDependency): string {
  return `${dependency.nodeId}\0${dependency.dependsOnNodeId}`;
}

function diagnostic(
  context: Pick<ComposeContext, 'projectId' | 'environmentInstanceId'>,
  message: string,
): StackDependencyDiscoveryDiagnostic {
  return {
    source: 'compose',
    projectId: context.projectId,
    environmentInstanceId: context.environmentInstanceId,
    message,
  };
}

function composeContexts(stack: Stack): ComposeContext[] {
  const contexts = new Map<string, ComposeContext>();

  for (const node of stack.nodes) {
    if (node.target.kind !== 'compose-service') continue;

    const key = `${node.target.projectId}\0${node.target.environmentInstanceId}`;
    const existing = contexts.get(key);
    if (existing) {
      existing.nodes.push(node);
      continue;
    }

    contexts.set(key, {
      key,
      projectId: node.target.projectId,
      environmentInstanceId: node.target.environmentInstanceId,
      nodes: [node],
    });
  }

  return [...contexts.values()]
    .map((context) => ({
      ...context,
      nodes: [...context.nodes].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export class StackDependencyDiscoveryService {
  private readonly topology = new StackTopologyService();

  public constructor(
    private readonly dependencies: {
      stackDefinitionService: Pick<StackDefinitionService, 'findById'>;
      projectStore: Pick<ProjectStore, 'findProject'>;
      developmentEnvironmentInstanceStore: Pick<
        DevelopmentEnvironmentInstanceStore,
        'resolveForProject'
      >;
      dockerComposeProvider: Pick<DockerComposeProvider, 'inspect'>;
    },
  ) {}

  public async discover(stackId: string): Promise<StackDependencyDiscovery> {
    const stack = this.dependencies.stackDefinitionService.findById(stackId);
    if (!stack) {
      throw new StackDependencyDiscoveryServiceError('Stack not found.');
    }

    const suggestions: StackDependencySuggestion[] = [];
    const diagnostics: StackDependencyDiscoveryDiagnostic[] = [];
    const knownDependencies = new Set(stack.dependencies.map(dependencyKey));
    let candidateStack: Stack = {
      ...stack,
      dependencies: stack.dependencies.map((dependency) => ({ ...dependency })),
    };

    for (const context of composeContexts(stack)) {
      const firstNode = context.nodes[0];
      if (!firstNode) continue;

      const resolution = resolveStackComposeProject(
        {
          projectStore: this.dependencies.projectStore,
          developmentEnvironmentInstanceStore:
            this.dependencies.developmentEnvironmentInstanceStore,
        },
        firstNode.target,
      );

      if (resolution.state !== 'resolved') {
        diagnostics.push(diagnostic(context, resolution.diagnostic));
        continue;
      }

      let inspection;
      try {
        inspection = await this.dependencies.dockerComposeProvider.inspect(
          resolution.project,
        );
      } catch {
        diagnostics.push(
          diagnostic(context, 'Docker Compose discovery failed.'),
        );
        continue;
      }

      if (!inspection.config) {
        diagnostics.push(
          diagnostic(
            context,
            inspection.diagnostic ??
              'Docker Compose configuration is unavailable for dependency discovery.',
          ),
        );
        continue;
      }

      const nodesByService = new Map<string, ComposeStackNode[]>();
      for (const node of context.nodes) {
        const matches = nodesByService.get(node.target.service) ?? [];
        matches.push(node);
        nodesByService.set(node.target.service, matches);
      }

      for (const node of context.nodes) {
        const definition = inspection.config.services.find(
          (service) => service.name === node.target.service,
        );
        if (!definition) {
          diagnostics.push(
            diagnostic(
              context,
              `Compose service ${node.target.service} is not present in the resolved configuration.`,
            ),
          );
          continue;
        }

        for (const dependsOnService of [...definition.dependsOn].sort()) {
          const matches = nodesByService.get(dependsOnService) ?? [];
          if (matches.length === 0) continue;

          if (matches.length > 1) {
            diagnostics.push(
              diagnostic(
                context,
                `Compose dependency ${node.target.service} -> ${dependsOnService} is ambiguous in this Stack.`,
              ),
            );
            continue;
          }

          const dependsOnNode = matches[0]!;
          const dependency: StackDependency = {
            nodeId: node.id,
            dependsOnNodeId: dependsOnNode.id,
          };
          const key = dependencyKey(dependency);
          if (knownDependencies.has(key)) continue;

          const nextStack: Stack = {
            ...candidateStack,
            dependencies: [...candidateStack.dependencies, dependency],
          };

          try {
            this.topology.plan(nextStack);
          } catch {
            diagnostics.push(
              diagnostic(
                context,
                `Compose dependency ${node.target.service} -> ${dependsOnService} would make the Stack topology invalid.`,
              ),
            );
            continue;
          }

          suggestions.push({
            dependency,
            evidence: {
              source: 'compose',
              projectId: context.projectId,
              environmentInstanceId: context.environmentInstanceId,
              service: node.target.service,
              dependsOnService,
              observedAt: inspection.config.observedAt,
            },
          });
          knownDependencies.add(key);
          candidateStack = nextStack;
        }
      }
    }

    return { stackId, suggestions, diagnostics };
  }
}
