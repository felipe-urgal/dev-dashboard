import { requestJson } from './core';

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  url: string;
  author: string;
  labels: string[];
  updatedAt: string;
}

export interface GithubIssuePage {
  repository: string;
  issues: GithubIssue[];
  hasMore: boolean;
  page: number;
}

function endpoint(projectId: string): string {
  return '/api/projects/' + encodeURIComponent(projectId) + '/git/issues';
}

export async function fetchProjectGithubIssues(
  projectId: string,
  state: 'open' | 'closed',
  page: number,
): Promise<GithubIssuePage> {
  return requestJson<GithubIssuePage>(
    endpoint(projectId) + '?state=' + state + '&page=' + page,
  );
}

export async function createProjectGithubIssue(
  projectId: string,
  title: string,
  body: string,
): Promise<GithubIssue> {
  const response = await requestJson<{ issue: GithubIssue }>(
    endpoint(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    },
  );
  return response.issue;
}

export async function updateProjectGithubIssue(
  projectId: string,
  issueNumber: number,
  title: string,
  body: string,
): Promise<GithubIssue> {
  const response = await requestJson<{ issue: GithubIssue }>(
    endpoint(projectId) + '/' + issueNumber,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    },
  );
  return response.issue;
}

export async function closeProjectGithubIssue(
  projectId: string,
  issueNumber: number,
): Promise<GithubIssue> {
  const response = await requestJson<{ issue: GithubIssue }>(
    endpoint(projectId) + '/' + issueNumber + '/close',
    { method: 'POST' },
  );
  return response.issue;
}
