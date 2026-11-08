/** Rol de un usuario del sistema */
export enum Role {
  /** Promotor de salud en campo: registra pacientes y casos */
  PROMOTOR = 'PROMOTOR',
  /** Médico especialista (atiende la cola de triage) */
  ESPECIALISTA = 'ESPECIALISTA',
  ADMIN = 'ADMIN',
}
