import type { Component } from 'vue';
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  ShareIcon,
  SparklesIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

export const iconByLabel: Record<string, Component> = {
  Resumo: Squares2X2Icon,
  Branches: ShareIcon,
  Sincronização: ArrowsRightLeftIcon,
  Commit: CheckCircleIcon,
  Diff: DocumentMagnifyingGlassIcon,
  'Code review IA': SparklesIcon,
  Histórico: ClockIcon,
};
