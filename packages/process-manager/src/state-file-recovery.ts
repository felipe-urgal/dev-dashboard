import { copyFileSync, existsSync } from 'node:fs';

/**
 * Quando um arquivo de estado de processo existe mas não pôde ser lido ou
 * interpretado (JSON corrompido, ou um formato que este build não reconhece
 * mais), guarda uma cópia ao lado antes de tratá-lo como ausente, para nunca
 * perder o registro do usuário silenciosamente nem derrubar a listagem de
 * todos os outros processos por causa de um único arquivo ruim. Mesmo
 * padrão de `@dev-dashboard/core` (`state-file-recovery.ts`), replicado
 * aqui porque `process-manager` não depende de `core`.
 */
export function quarantineUnreadableStateFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = `${filePath}.unreadable-${timestamp}.bak`;

  try {
    copyFileSync(filePath, quarantinePath);
    console.warn(
      `dev-dashboard: não foi possível ler ${filePath} (formato inesperado); uma cópia foi salva em ${quarantinePath} e o arquivo original será ignorado.`,
    );
  } catch {
    console.warn(
      `dev-dashboard: não foi possível ler ${filePath} (formato inesperado) e a tentativa de salvar uma cópia de segurança também falhou; o arquivo será ignorado.`,
    );
  }
}
