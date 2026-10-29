import type { Component } from 'vue';
import {
  BeakerIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentTextIcon,
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
  tests: BeakerIcon,
  agent: CpuChipIcon,
  production: RocketLaunchIcon,
  readme: DocumentTextIcon,
};
