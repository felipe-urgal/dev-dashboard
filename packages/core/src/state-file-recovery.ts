import { copyFileSync, existsSync } from 'node:fs';

export function isFileNotFoundError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Quando um arquivo de estado existe mas não pôde ser lido/interpretado
 * (JSON corrompido, ou um campo `version` que não bate — ex. um schema
 * futuro que este build ainda não entende), guarda uma cópia ao lado antes
 * do repository recriar o arquivo com os valores padrão, para nunca perder
 * dados do usuário silenciosamente. Não faz nada quando o arquivo não
 * existe (primeira execução — caso normal, não um erro).
 */
export function quarantineUnreadableStateFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = `${filePath}.unreadable-${timestamp}.bak`;

  try {
    copyFileSync(filePath, quarantinePath);
    console.warn(
      `dev-dashboard: não foi possível ler ${filePath} (formato inesperado ou versão não suportada); uma cópia foi salva em ${quarantinePath} antes de recriar o arquivo com os valores padrão.`,
    );
  } catch {
    console.warn(
      `dev-dashboard: não foi possível ler ${filePath} (formato inesperado ou versão não suportada) e a tentativa de salvar uma cópia de segurança também falhou; o arquivo será recriado com os valores padrão.`,
    );
  }
}
