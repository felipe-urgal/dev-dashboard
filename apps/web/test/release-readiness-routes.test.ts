import { describe, expect, it } from 'vitest';

import { router } from '../src/router';
import {
  releaseReadinessActionRoutes,
  releaseReadinessActionRoute,
} from '../src/api/release-readiness-routes';
import type { ReleaseReadinessActionTarget } from '../src/api/release-readiness';

describe('Release Readiness action navigation', () => {
  it('registra uma rota existente para todos os targets do contrato', () => {
    for (const target of Object.keys(
      releaseReadinessActionRoutes,
    ) as ReleaseReadinessActionTarget[]) {
      const route = releaseReadinessActionRoute(target, 'project-1');
      expect(typeof route).toBe('object');
      if (typeof route === 'string') throw new Error('Esperada rota nomeada');
      expect(route.name, target).toBeDefined();
      expect(router.hasRoute(route.name!), target).toBe(true);
      const resolved = router.resolve(route);
      expect(resolved.params.projectId).toBe('project-1');
      expect(resolved.matched.length, target).toBeGreaterThan(0);
      expect(resolved.name, target).not.toBe('not-found');
    }
  });

  it('direciona Segurança para o Security Center real', () => {
    const route = releaseReadinessActionRoute('security', 'project-1');
    expect(router.resolve(route).href).toBe('/projects/project-1/security');
    expect(router.hasRoute('project-security-center')).toBe(true);
  });

  it('preserva as abas específicas de Sincronização e Pull Request', () => {
    expect(
      router.resolve(
        releaseReadinessActionRoute('synchronization', 'project-1'),
      ).query.tab,
    ).toBe('sync');
    expect(
      router.resolve(releaseReadinessActionRoute('pull-request', 'project-1'))
        .query.tab,
    ).toBe('pull-request');
  });
});
