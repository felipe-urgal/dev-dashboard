import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentAuthorizationScopeError,
  assertAgentAuthorizationScope,
  grantedAgentAuthorizations,
  type AgentAuthorization,
} from '../src/index.js';

test('scoped authorization matches only the exact backend-owned resource', () => {
  const authorization: AgentAuthorization = {
    taskId: 'task-1',
    capability: 'git:push',
    granted: true,
    observedAt: '2026-09-26T18:30:00.000Z',
    scope: {
      kind: 'branch',
      projectId: 'project-1',
      branch: 'feature/900-agent-resource-scoped-authorizations',
    },
  };

  assert.doesNotThrow(() =>
    assertAgentAuthorizationScope(authorization, {
      kind: 'branch',
      projectId: 'project-1',
      branch: 'feature/900-agent-resource-scoped-authorizations',
    }),
  );
  assert.throws(
    () =>
      assertAgentAuthorizationScope(authorization, {
        kind: 'branch',
        projectId: 'project-1',
        branch: 'main',
      }),
    AgentAuthorizationScopeError,
  );
});

test('legacy unscoped grant does not satisfy a scoped resource check', () => {
  const authorization: AgentAuthorization = {
    taskId: 'task-1',
    capability: 'github:merge',
    granted: true,
    observedAt: '2026-09-26T18:30:00.000Z',
  };

  assert.throws(
    () =>
      assertAgentAuthorizationScope(authorization, {
        kind: 'pull-request',
        repository: 'felipe-urgal/dev-dashboard',
        number: 123,
      }),
    AgentAuthorizationScopeError,
  );
});

test('latest grant remains bounded by its own capability and scope', () => {
  const grants = grantedAgentAuthorizations([
    {
      taskId: 'task-1',
      capability: 'git:push',
      granted: true,
      observedAt: '2026-09-26T18:30:00.000Z',
      scope: {
        kind: 'branch',
        projectId: 'project-1',
        branch: 'feature/a',
      },
    },
    {
      taskId: 'task-1',
      capability: 'github:merge',
      granted: false,
      observedAt: '2026-09-26T18:31:00.000Z',
    },
  ]);

  assert.equal(grants.length, 1);
  assert.equal(grants[0]?.capability, 'git:push');
  assert.deepEqual(grants[0]?.scope, {
    kind: 'branch',
    projectId: 'project-1',
    branch: 'feature/a',
  });
});
