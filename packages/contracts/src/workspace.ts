export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  /** Ativa a varredura recursiva (monorepos) ao escanear este workspace. */
  recursiveScan: boolean;
}
