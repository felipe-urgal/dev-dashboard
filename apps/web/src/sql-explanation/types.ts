export interface SqlExplanation {
  description: string;
  expectedReturn: string;
  mainTable?: string | undefined;
  relatedTables: string[];
}
