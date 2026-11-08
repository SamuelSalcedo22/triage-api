import { Priority } from '../enums';

/** Alerta generada por el triage */
export interface TriageAlert {
  /** Gravedad de la alerta */
  level: Priority;
  /** Código corto para que el frontend pueda mostrar íconos/colores */
  code: string;
  /** Mensaje legible para el especialista */
  message: string;
  /** De qué regla salió la alerta */
  source: 'NEWS2' | 'HTA' | 'DIABETES' | 'SINTOMAS' | 'GENERAL';
}

/** Puntaje de un parámetro de NEWS2 */
export interface News2ParameterScore {
  parameter: string;
  value: string | number | boolean;
  points: number;
}

/** Resultado completo de una evaluación de triage */
export interface TriageResult {
  news2Score: number;
  news2Breakdown: News2ParameterScore[];
  /** true si algún parámetro individual sumó 3 puntos ("puntaje rojo") */
  hasRedScore: boolean;
  /** Prioridad que da NEWS2 por sí solo */
  news2Priority: Priority;
  /** Prioridad final: la más grave entre NEWS2 y las reglas HTA/DM/síntomas */
  priority: Priority;
  alerts: TriageAlert[];
  recommendation: string;
}
