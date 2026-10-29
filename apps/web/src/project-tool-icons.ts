import type { Component } from 'vue';
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentTextIcon,
  FolderIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ServerStackIcon,
} from '@heroicons/vue/24/outline';

import type { ProjectToolIcon } from './project-tools';

export const projectToolIcons: Record<ProjectToolIcon, Component> = {
  server: ServerStackIcon,
  terminal: CommandLineIcon,
  console: CommandLineIcon,
  sidekiq: QueueListIcon,
  webpack: CodeBracketIcon,
  git: CodeBracketIcon,
  worktrees: FolderIcon,
  tests: BeakerIcon,
  environment: AdjustmentsHorizontalIcon,
  agent: CpuChipIcon,
  production: RocketLaunchIcon,
  readme: DocumentTextIcon,
};
