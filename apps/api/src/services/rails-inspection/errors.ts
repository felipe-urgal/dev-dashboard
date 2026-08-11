export type RailsMutationErrorCode =
  | 'RAILS_MUTATION_UNSUPPORTED'
  | 'RAILS_MUTATION_ALREADY_RUNNING'
  | 'RAILS_MUTATION_FAILED'
  | 'RAILS_GENERATOR_INVALID_INPUT'
  | 'RAILS_GENERATOR_UNSUPPORTED'
  | 'RAILS_GENERATOR_CONFIRMATION_REQUIRED';

export class RailsMutationError extends Error {
  public constructor(
    public readonly code: RailsMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RailsMutationError';
  }
}
