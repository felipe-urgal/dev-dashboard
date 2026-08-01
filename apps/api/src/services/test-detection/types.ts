import type { ProjectTestCommand } from '@dev-dashboard/contracts';

export interface ResolvedCommand {
  command: string;
  args: string[];
}

export interface DetectedTestCommand extends Omit<ProjectTestCommand, 'supportsFileTarget'> {
  resolved: ResolvedCommand;
}
