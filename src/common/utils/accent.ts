/**
 * Quita diacríticos (tildes, diéresis...) para búsquedas.
 * "jose" coincide con "José", "ANDRES" con "Andrés".
 */
export function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Patrón LIKE/ILIKE seguro a partir del término de búsqueda. */
export function likePattern(raw: string): string {
  const folded = foldAccents(raw.trim());
  // Escapar metacaracteres de LIKE
  const escaped = folded.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

/**
 * Expresión SQL (Postgres) que pliega tildes en una columna de texto.
 * Debe usarse con `lower` implícito del translate.
 * Columnas: pasar "e.merchant_name" o solo el identificador calificado.
 */
export const SQL_FOLD_FROM =
  "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const SQL_FOLD_TO =
  "aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc";

export function sqlFoldColumn(column: string): string {
  return `translate(lower(${column}), '${SQL_FOLD_FROM}', '${SQL_FOLD_TO}')`;
}
