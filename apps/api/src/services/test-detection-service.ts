import path from 'node:path';

import type {
  Project,
  ProjectTestFile,
  ProjectTestOverview,
} from '@dev-dashboard/contracts';

import {
  composeFileCommand,
  ensureTestPathInsideProject,
  findTestFiles,
  FILE_TARGET_PATTERNS,
} from './test-detection/file-scan.js';
import { detectNodeCommands } from './test-detection/node-detection.js';
import { detectPythonCommands } from './test-detection/python-detection.js';
import { detectRailsCommands } from './test-detection/rails-detection.js';
import type {
  DetectedTestCommand,
  ResolvedCommand,
} from './test-detection/types.js';
import { TestFileError } from './test-detection/errors.js';

export { TestFileError } from './test-detection/errors.js';
export type { TestFileErrorCode } from './test-detection/errors.js';

export class TestDetectionService {
  private readonly cache = new Map<string, DetectedTestCommand[]>();

  public invalidate(projectId?: string): void {
    if (projectId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(projectId);
    }
  }

  public async getOverview(project: Project): Promise<ProjectTestOverview> {
    const commands = await this.detect(project);

    return {
      supported: commands.length > 0,
      commands: commands
        .map(({ resolved: _resolved, ...rest }) => ({
          ...rest,
          supportsFileTarget: Boolean(FILE_TARGET_PATTERNS[rest.runner]),
        }))
        .sort((left, right) => left.priority - right.priority),
    };
  }

  public async resolveCommand(
    project: Project,
    commandId: string,
  ): Promise<ResolvedCommand | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    return command ? command.resolved : null;
  }

  public async listTestFiles(
    project: Project,
    commandId: string,
  ): Promise<ProjectTestFile[] | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    if (!command) return null;

    const pattern = FILE_TARGET_PATTERNS[command.runner];
    if (!pattern) return [];

    const files = await findTestFiles(project.path, pattern);
    return files.map((filePath) => ({ path: filePath }));
  }

  public async resolveFileCommand(
    project: Project,
    commandId: string,
    filePath: string,
  ): Promise<ResolvedCommand | null> {
    const commands = await this.detect(project);
    const command = commands.find((entry) => entry.id === commandId);
    if (!command) return null;

    const pattern = FILE_TARGET_PATTERNS[command.runner];
    if (!pattern) {
      throw new TestFileError(
        'TEST_FILE_TARGET_UNSUPPORTED',
        'Este comando não suporta executar um arquivo específico.',
      );
    }

    const safePath = ensureTestPathInsideProject(project.path, filePath);
    if (!pattern.test(path.basename(safePath))) {
      throw new TestFileError(
        'TEST_FILE_NOT_FOUND',
        'O arquivo informado não corresponde a um arquivo de teste reconhecido.',
      );
    }

    return composeFileCommand(command.resolved, safePath);
  }

  private async detect(project: Project): Promise<DetectedTestCommand[]> {
    const cached = this.cache.get(project.id);
    if (cached) {
      return cached;
    }

    const commands: DetectedTestCommand[] = [];

    if (project.type === 'node') {
      commands.push(...(await detectNodeCommands(project)));
    } else if (project.type === 'rails') {
      commands.push(...(await detectRailsCommands(project)));
    }

    commands.push(...(await detectPythonCommands(project)));

    this.cache.set(project.id, commands);
    return commands;
  }
}
