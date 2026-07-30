import type { Component } from 'vue';
import {
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CodeBracketIcon,
  DocumentMagnifyingGlassIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

export const iconByLabel: Record<string, Component> = {
  Resumo: Squares2X2Icon,
  Branches: CodeBracketIcon,
  Sincronização: ArrowsRightLeftIcon,
  Commit: CheckCircleIcon,
  Stash: ArchiveBoxIcon,
  Diff: DocumentMagnifyingGlassIcon,
  Histórico: ClockIcon,
};
