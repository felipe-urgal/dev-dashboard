export interface EnvironmentProfileVariable {
  name: string;
  value?: string;
}

export interface EnvironmentProfile {
  id: string;
  name: string;
  variables: EnvironmentProfileVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentProfileLimits {
  maxProfiles: number;
  maxVariablesPerProfile: number;
  maxNameLength: number;
  maxValueLength: number;
}

export interface EnvironmentProfileList {
  profiles: EnvironmentProfile[];
  limits: EnvironmentProfileLimits;
}

export interface CreateEnvironmentProfileInput {
  name: string;
  variables: EnvironmentProfileVariable[];
}

export type UpdateEnvironmentProfileInput = CreateEnvironmentProfileInput;
