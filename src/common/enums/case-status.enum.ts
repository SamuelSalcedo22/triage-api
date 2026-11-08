/** Estados del caso: PENDIENTE → EN_REVISION → ATENDIDO / DERIVADO / CERRADO */
export enum CaseStatus {
  PENDIENTE = 'PENDIENTE',
  EN_REVISION = 'EN_REVISION',
  ATENDIDO = 'ATENDIDO',
  DERIVADO = 'DERIVADO',
  CERRADO = 'CERRADO',
}

/** Transiciones de estado permitidas (de → a) */
export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  [CaseStatus.PENDIENTE]: [CaseStatus.EN_REVISION, CaseStatus.CERRADO],
  [CaseStatus.EN_REVISION]: [CaseStatus.PENDIENTE, CaseStatus.ATENDIDO, CaseStatus.DERIVADO, CaseStatus.CERRADO],
  [CaseStatus.ATENDIDO]: [CaseStatus.CERRADO],
  [CaseStatus.DERIVADO]: [CaseStatus.CERRADO],
  [CaseStatus.CERRADO]: [],
};
