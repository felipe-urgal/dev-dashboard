export type JobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  projectId?: string;
  action: string;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
}
