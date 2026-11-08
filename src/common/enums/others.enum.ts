/**
 * Nivel de conciencia según la escala ACVPU usada por NEWS2.
 * A = Alerta, C = Confusión nueva, V = responde a la Voz,
 * P = responde al dolor (Pain), U = no responde (Unresponsive).
 */
export enum Consciousness {
  A = 'A',
  C = 'C',
  V = 'V',
  P = 'P',
  U = 'U',
}

/** Tipos de documento de identidad en Colombia */
export enum DocumentType {
  /** Cédula de ciudadanía */
  CC = 'CC',
  /** Tarjeta de identidad */
  TI = 'TI',
  /** Registro civil */
  RC = 'RC',
  /** Cédula de extranjería */
  CE = 'CE',
  /** Pasaporte */
  PA = 'PA',
  /** Permiso por protección temporal (población migrante) */
  PPT = 'PPT',
}

export enum Sex {
  M = 'M',
  F = 'F',
  OTRO = 'OTRO',
}

/** Tipo de archivo adjunto a un caso */
export enum AttachmentType {
  FOTO = 'FOTO',
  ECG = 'ECG',
  HISTORIA_CLINICA = 'HISTORIA_CLINICA',
  LABORATORIO = 'LABORATORIO',
  OTRO = 'OTRO',
}
