export type TestFileErrorCode =
  'TEST_FILE_TARGET_UNSUPPORTED' | 'TEST_FILE_NOT_FOUND';

export class TestFileError extends Error {
  public constructor(
    public readonly code: TestFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TestFileError';
  }
}
