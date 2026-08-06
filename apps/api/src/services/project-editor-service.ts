import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectEditor,
  ProjectEditorAvailability,
  ProjectEditorId,
  ProjectEditorLaunchResult,
} from '@dev-dashboard/contracts';

interface EditorDefinition extends ProjectEditor {
  command: string;
}

const EDITORS: readonly EditorDefinition[] = [
  { id: 'vscode', name: 'Visual Studio Code', command: 'code' },
  { id: 'cursor', name: 'Cursor', command: 'cursor' },
  { id: 'vscodium', name: 'VSCodium', command: 'codium' },
  { id: 'sublime', name: 'Sublime Text', command: 'subl' },
  { id: 'zed', name: 'Zed', command: 'zed' },
];

export type ProjectEditorErrorCode =
  'EDITOR_NOT_AVAILABLE' | 'EDITOR_LAUNCH_FAILED';

export class ProjectEditorError extends Error {
  public constructor(
    public readonly code: ProjectEditorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectEditorError';
  }
}

export interface ProjectEditorServiceOptions {
  environment?: NodeJS.ProcessEnv;
  resolveExecutable?: (command: string) => Promise<string | null>;
  launch?: (command: string, projectPath: string) => Promise<void>;
}

async function executableOnPath(
  command: string,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const searchPath = environment.PATH ?? '';
  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continua procurando no catálogo de diretórios do PATH.
    }
  }
  return null;
}

function launchDetached(command: string, projectPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [projectPath], {
      cwd: projectPath,
      detached: true,
      shell: false,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function preferredEditor(
  editors: readonly EditorDefinition[],
  configuredEditor: string | undefined,
): ProjectEditorId | undefined {
  const configured = configuredEditor?.trim().toLocaleLowerCase('en-US');
  const selected = configured
    ? editors.find(
        (editor) => editor.id === configured || editor.command === configured,
      )
    : undefined;
  return selected?.id ?? editors[0]?.id;
}

export class ProjectEditorService {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly resolveExecutable: NonNullable<
    ProjectEditorServiceOptions['resolveExecutable']
  >;
  private readonly launch: NonNullable<ProjectEditorServiceOptions['launch']>;

  public constructor(options: ProjectEditorServiceOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.resolveExecutable =
      options.resolveExecutable ??
      ((command) => executableOnPath(command, this.environment));
    this.launch = options.launch ?? launchDetached;
  }

  public async availability(): Promise<ProjectEditorAvailability> {
    const resolved = await Promise.all(
      EDITORS.map(async (editor) => ({
        editor,
        executable: await this.resolveExecutable(editor.command),
      })),
    );
    const available = resolved
      .filter(
        (entry): entry is { editor: EditorDefinition; executable: string } =>
          Boolean(entry.executable),
      )
      .map((entry) => entry.editor);
    const preferredEditorId = preferredEditor(
      available,
      this.environment.DEV_EDITOR,
    );
    return {
      editors: available.map(({ id, name }) => ({ id, name })),
      ...(preferredEditorId ? { preferredEditorId } : {}),
    };
  }

  public async open(
    projectPath: string,
    editorId: ProjectEditorId,
  ): Promise<ProjectEditorLaunchResult> {
    const editor = EDITORS.find((candidate) => candidate.id === editorId);
    if (!editor) {
      throw new ProjectEditorError(
        'EDITOR_NOT_AVAILABLE',
        'O editor solicitado não faz parte do catálogo permitido.',
      );
    }
    const executable = await this.resolveExecutable(editor.command);
    if (!executable) {
      throw new ProjectEditorError(
        'EDITOR_NOT_AVAILABLE',
        `${editor.name} não está disponível no PATH da API.`,
      );
    }
    try {
      await this.launch(executable, projectPath);
    } catch {
      throw new ProjectEditorError(
        'EDITOR_LAUNCH_FAILED',
        `Não foi possível abrir o projeto no ${editor.name}.`,
      );
    }
    return {
      editor: { id: editor.id, name: editor.name },
      opened: true,
    };
  }
}
