import type { Service } from '@/data/mockData';

/** Tipo de línea para ITBMS por defecto (negocio Ancori). */
export type InvoiceLineProductKind = 'honorarios' | 'gastos' | 'other';

/** Valores guardados en `invoice_lines.categoria` y en estado de línea. */
export type InvoiceLineCategoria = 'honorarios' | 'gastos';

/**
 * Clasifica el nombre del servicio de catálogo para aplicar ITBMS:
 * - Honorarios → 7 %
 * - Gastos → 0 %
 */
export function classifyServiceLineType(nombre: string): InvoiceLineProductKind {
  const n = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bhonorari/.test(n)) return 'honorarios';
  if (/\bgastos?\b/.test(n)) return 'gastos';
  return 'other';
}

export function defaultItbmsForServiceName(nombre: string): number {
  const k = classifyServiceLineType(nombre);
  if (k === 'honorarios') return 7;
  if (k === 'gastos') return 0;
  return 7;
}

/** Primer servicio activo del catálogo que encaje como Honorarios / Gastos (opcional, para FK). */
export function resolveHonorariosAndGastosServices(services: Service[]): {
  honorarios: Service | null;
  gastos: Service | null;
} {
  const active = services.filter(s => s.activo !== false);
  const honorarios = active.find(s => classifyServiceLineType(s.nombre) === 'honorarios') ?? null;
  const gastos = active.find(s => classifyServiceLineType(s.nombre) === 'gastos') ?? null;
  return { honorarios, gastos };
}
