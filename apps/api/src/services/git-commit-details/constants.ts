export const FIELD_SEPARATOR = '\u001f';
export const RECORD_SEPARATOR = '\u001e';
export const PATCH_LIMIT = 320_000;
export const FILE_PATCH_LIMIT = 262_144;
export const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
/** Teto de itens por página, alinhado ao schema das rotas de histórico. */
export const HISTORY_PAGE_SIZE_LIMIT = 50;
export const HISTORY_REFERENCE_PATTERN = /^(?!-)[^\u0000-\u001f\u007f]{1,250}$/;

export const HISTORY_FORMAT = `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%P${RECORD_SEPARATOR}`;
