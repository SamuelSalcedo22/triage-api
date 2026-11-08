/**
 * Prioridad del caso.
 * IMPORTANTE: el orden de declaración importa. PostgreSQL ordena las columnas
 * de tipo enum según el orden en que se declararon los valores, por eso
 * "ORDER BY priority ASC" devuelve ALTA → MEDIA → BAJA.
 */
export enum Priority {
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAJA = 'BAJA',
}

/** Peso numérico de cada prioridad (sirve para quedarse con la más grave) */
export const PRIORITY_RANK: Record<Priority, number> = {
  [Priority.ALTA]: 3,
  [Priority.MEDIA]: 2,
  [Priority.BAJA]: 1,
};

/** Devuelve la prioridad más grave de una lista */
export function highestPriority(priorities: Priority[]): Priority {
  return priorities.reduce((max, p) => (PRIORITY_RANK[p] > PRIORITY_RANK[max] ? p : max), Priority.BAJA);
}
