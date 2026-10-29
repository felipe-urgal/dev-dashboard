import type { Component } from 'vue';
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CheckBadgeIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentTextIcon,
  FolderIcon,
  LockClosedIcon,
  PlayCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShieldCheckIcon,
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
  'local-ci': PlayCircleIcon,
  readiness: CheckBadgeIcon,
  security: LockClosedIcon,
  doctor: ShieldCheckIcon,
  agent: CpuChipIcon,
  production: RocketLaunchIcon,
  readme: DocumentTextIcon,
};
