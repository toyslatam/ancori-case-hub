import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Case,
  CaseComment,
  CaseExpense,
  CaseInvoice,
  Category,
  Client,
  Director,
  InvoiceLine,
  InvoiceTerm,
  QBItem,
  Service,
  Society,
  TipoSociedad,
  TipoDocumentoDirector,
} from '@/data/mockData';

function isoDate(s: string): string {
  if (s.includes('T')) return s.slice(0, 10);
  return s;
}

export function rowToClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    razon_social: row.razon_social != null && String(row.razon_social) !== '' ? String(row.razon_social) : String(row.nombre),
    numero: row.numero != null ? Number(row.numero) : undefined,
    email: String(row.email ?? ''),
    telefono: String(row.telefono ?? ''),
    identificacion: String(row.identificacion ?? ''),
    direccion: String(row.direccion ?? ''),
    quickbooks_customer_id: row.quickbooks_customer_id ? String(row.quickbooks_customer_id) : undefined,
    activo: Boolean(row.activo),
    observaciones: row.observaciones ? String(row.observaciones) : undefined,
    created_at: isoDate(String(row.created_at ?? '')),
  };
}

export function clientToRow(c: Client): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: c.id,
    nombre: c.nombre,
    razon_social: c.razon_social,
    email: c.email,
    telefono: c.telefono,
    identificacion: c.identificacion,
    direccion: c.direccion,
    quickbooks_customer_id: c.quickbooks_customer_id ?? null,
    activo: c.activo,
    observaciones: c.observaciones ?? null,
    created_at: c.created_at.includes('T') ? c.created_at : `${c.created_at}T12:00:00Z`,
  };
  if (c.numero != null) row.numero = c.numero;
  return row;
}

function coerceTipoSociedad(v: string): TipoSociedad {
  if (v === 'SOCIEDADES' || v === 'FUNDACIONES' || v === 'B.V.I') return v;
  return 'SOCIEDADES';
}

export function rowToSociety(row: Record<string, unknown>): Society {
  const fi = row.fecha_inscripcion;
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    nombre: String(row.nombre),
    razon_social: String(row.razon_social ?? ''),
    tipo_sociedad: coerceTipoSociedad(String(row.tipo_sociedad ?? 'SOCIEDADES')),
    correo: String(row.correo ?? ''),
    telefono: String(row.telefono ?? ''),
    id_qb: row.id_qb != null && row.id_qb !== '' ? Number(row.id_qb) : undefined,
    ruc: String(row.ruc ?? ''),
    dv: String(row.dv ?? ''),
    nit: String(row.nit ?? ''),
    presidente_id: row.presidente_id ? String(row.presidente_id) : undefined,
    tesorero_id: row.tesorero_id ? String(row.tesorero_id) : undefined,
    secretario_id: row.secretario_id ? String(row.secretario_id) : undefined,
    pago_tasa_unica: String(row.pago_tasa_unica ?? ''),
    fecha_inscripcion: fi != null && String(fi) !== '' ? isoDate(String(fi)) : undefined,
    identificacion_fiscal: row.identificacion_fiscal ? String(row.identificacion_fiscal) : undefined,
    quickbooks_customer_id: row.quickbooks_customer_id ? String(row.quickbooks_customer_id) : undefined,
    activo: Boolean(row.activo),
    created_at: isoDate(String(row.created_at ?? '')),
  };
}

export function societyToRow(s: Society): Record<string, unknown> {
  return {
    id: s.id,
    client_id: s.client_id,
    nombre: s.nombre,
    razon_social: s.razon_social,
    tipo_sociedad: s.tipo_sociedad,
    correo: s.correo,
    telefono: s.telefono,
    id_qb: s.id_qb ?? null,
    ruc: s.ruc,
    dv: s.dv,
    nit: s.nit,
    presidente_id: s.presidente_id ?? null,
    tesorero_id: s.tesorero_id ?? null,
    secretario_id: s.secretario_id ?? null,
    pago_tasa_unica: s.pago_tasa_unica,
    fecha_inscripcion: s.fecha_inscripcion?.trim() ? s.fecha_inscripcion : null,
    identificacion_fiscal: s.identificacion_fiscal ?? null,
    quickbooks_customer_id: s.quickbooks_customer_id ?? null,
    activo: s.activo,
    created_at: s.created_at.includes('T') ? s.created_at : `${s.created_at}T12:00:00Z`,
  };
}

export function rowToService(row: Record<string, unknown>): Service {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    categoria: String(row.categoria ?? ''),
    category_id: row.category_id ? String(row.category_id) : undefined,
    id_qb: row.id_qb != null ? Number(row.id_qb) : undefined,
    descripcion: String(row.descripcion ?? ''),
    codigo: row.codigo ? String(row.codigo) : undefined,
    tarifa_base: row.tarifa_base != null ? Number(row.tarifa_base) : undefined,
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function serviceToRow(s: Service): Record<string, unknown> {
  return {
    id: s.id,
    nombre: s.nombre,
    categoria: s.categoria ?? '',
    category_id: s.category_id ?? null,
    id_qb: s.id_qb ?? null,
    descripcion: s.descripcion,
    codigo: s.codigo ?? null,
    tarifa_base: s.tarifa_base ?? null,
    activo: s.activo,
    ...(s.created_at ? { created_at: s.created_at.includes('T') ? s.created_at : `${s.created_at}T12:00:00Z` } : {}),
  };
}

export function rowToInvoiceTerm(row: Record<string, unknown>): InvoiceTerm {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    dias_vencimiento: Number(row.dias_vencimiento),
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function invoiceTermToRow(t: InvoiceTerm): Record<string, unknown> {
  return {
    id: t.id,
    nombre: t.nombre,
    dias_vencimiento: t.dias_vencimiento,
    activo: t.activo,
    ...(t.created_at ? { created_at: t.created_at.includes('T') ? t.created_at : `${t.created_at}T12:00:00Z` } : {}),
  };
}

export function rowToCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    id_qb: row.id_qb != null && row.id_qb !== '' ? Number(row.id_qb) : undefined,
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : new Date().toISOString().slice(0, 10),
  };
}

export function categoryToRow(c: Category): Record<string, unknown> {
  return {
    id: c.id,
    nombre: c.nombre,
    id_qb: c.id_qb ?? null,
    activo: c.activo,
    created_at: c.created_at.includes('T') ? c.created_at : `${c.created_at}T12:00:00Z`,
  };
}

export function rowToQBItem(row: Record<string, unknown>): QBItem {
  return {
    id: String(row.id),
    nombre_interno: String(row.nombre_interno),
    nombre_qb: String(row.nombre_qb),
    qb_item_id: row.qb_item_id ? String(row.qb_item_id) : undefined,
    tipo: String(row.tipo),
    impuesto_default: row.impuesto_default != null ? Number(row.impuesto_default) : undefined,
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function qbItemToRow(q: QBItem): Record<string, unknown> {
  return {
    id: q.id,
    nombre_interno: q.nombre_interno,
    nombre_qb: q.nombre_qb,
    qb_item_id: q.qb_item_id ?? null,
    tipo: q.tipo,
    impuesto_default: q.impuesto_default ?? null,
    activo: q.activo,
    ...(q.created_at ? { created_at: q.created_at.includes('T') ? q.created_at : `${q.created_at}T12:00:00Z` } : {}),
  };
}

function coerceTipoDocumentoDirector(v: string): TipoDocumentoDirector {
  if (v === 'Cedula' || v === 'Pasaporte' || v === 'Otro') return v;
  return 'Cedula';
}

export function rowToDirector(row: Record<string, unknown>): Director {
  const fv = row.fecha_vencimiento_documento;
  const nm = row.nombre ?? row.titulo;
  return {
    id: String(row.id),
    nombre: String(nm ?? ''),
    comentarios: String(row.comentarios ?? ''),
    activo: Boolean(row.activo),
    fecha_vencimiento_documento: fv != null && String(fv) !== '' ? isoDate(String(fv)) : undefined,
    tipo_documento: coerceTipoDocumentoDirector(String(row.tipo_documento ?? 'Cedula')),
    created_at: isoDate(String(row.created_at ?? '')),
  };
}

export function directorToRow(d: Director): Record<string, unknown> {
  const fv = d.fecha_vencimiento_documento?.trim();
  return {
    id: d.id,
    nombre: d.nombre,
    comentarios: d.comentarios,
    activo: d.activo,
    fecha_vencimiento_documento: fv ? fv : null,
    tipo_documento: d.tipo_documento,
    created_at: d.created_at.includes('T') ? d.created_at : `${d.created_at}T12:00:00Z`,
  };
}

function rowToComment(row: Record<string, unknown>): CaseComment {
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    user_name: String(row.user_name),
    comentario: String(row.comentario),
    created_at: String(row.created_at),
  };
}

function rowToExpense(row: Record<string, unknown>): CaseExpense {
  const cantidad = Number(row.cantidad);
  const importe = Number(row.importe);
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    descripcion: String(row.descripcion),
    cantidad,
    importe,
    total: cantidad * importe,
    fecha: String(row.fecha),
    observaciones: row.observaciones ? String(row.observaciones) : undefined,
  };
}

function rowToInvoiceLine(row: Record<string, unknown>): InvoiceLine {
  const cantidad = Number(row.cantidad);
  const tarifa = Number(row.tarifa);
  return {
    id: String(row.id),
    servicio_id: row.servicio_id ? String(row.servicio_id) : undefined,
    qb_item_id: row.qb_item_id ? String(row.qb_item_id) : undefined,
    descripcion: String(row.descripcion),
    cantidad,
    tarifa,
    importe: cantidad * tarifa,
    itbms: Number(row.itbms ?? 0),
  };
}

function rowToInvoice(row: Record<string, unknown>, lines: InvoiceLine[]): CaseInvoice {
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    client_id: row.client_id ? String(row.client_id) : undefined,
    society_id: row.society_id ? String(row.society_id) : undefined,
    term_id: row.term_id ? String(row.term_id) : undefined,
    fecha_factura: String(row.fecha_factura),
    fecha_vencimiento: String(row.fecha_vencimiento),
    subtotal: Number(row.subtotal),
    impuesto: Number(row.impuesto),
    total: Number(row.total),
    estado: row.estado as CaseInvoice['estado'],
    qb_invoice_id: row.qb_invoice_id ? String(row.qb_invoice_id) : undefined,
    lines,
  };
}

function rowToCase(row: Record<string, unknown>, nest: {
  comments: CaseComment[];
  expenses: CaseExpense[];
  invoices: CaseInvoice[];
}): Case {
  return {
    id: String(row.id),
    numero_caso: String(row.numero_caso),
    client_id: row.client_id ? String(row.client_id) : undefined,
    society_id: row.society_id ? String(row.society_id) : undefined,
    service_id: String(row.service_id),
    descripcion: String(row.descripcion),
    estado: row.estado as Case['estado'],
    etapa: String(row.etapa),
    gastos_cotizados: Number(row.gastos_cotizados),
    cliente_temporal: Boolean(row.cliente_temporal),
    prioridad_urgente: Boolean(row.prioridad_urgente),
    creado_por: String(row.creado_por),
    responsable: String(row.responsable),
    observaciones: String(row.observaciones ?? ''),
    fecha_caso: String(row.fecha_caso),
    created_at: isoDate(String(row.created_at ?? '')),
    comments: nest.comments,
    expenses: nest.expenses,
    invoices: nest.invoices,
  };
}

export function caseToRow(c: Case): Record<string, unknown> {
  return {
    id: c.id,
    numero_caso: c.numero_caso,
    client_id: c.client_id ?? null,
    society_id: c.society_id ?? null,
    service_id: c.service_id,
    descripcion: c.descripcion,
    estado: c.estado,
    etapa: c.etapa,
    gastos_cotizados: c.gastos_cotizados,
    cliente_temporal: c.cliente_temporal,
    prioridad_urgente: c.prioridad_urgente,
    creado_por: c.creado_por,
    responsable: c.responsable,
    observaciones: c.observaciones,
    fecha_caso: c.fecha_caso,
    created_at: c.created_at.includes('T') ? c.created_at : `${c.created_at}T12:00:00Z`,
  };
}

export type LoadAllFromSupabaseResult = {
  clients: Client[];
  societies: Society[];
  services: Service[];
  invoiceTerms: InvoiceTerm[];
  categories: Category[];
  qbItems: QBItem[];
  directores: Director[];
  cases: Case[];
  /** Tablas que fallaron (p. ej. tabla aún no creada en SQL); el resto viene de Supabase. */
  loadWarnings: string[];
};

export async function loadAllFromSupabase(sb: SupabaseClient): Promise<LoadAllFromSupabaseResult> {
  const [
    clientsRes,
    societiesRes,
    servicesRes,
    termsRes,
    categoriesRes,
    qbRes,
    directoresRes,
    casesRes,
    commentsRes,
    expensesRes,
    invoicesRes,
    linesRes,
  ] = await Promise.all([
    sb.from('clients').select('*').order('numero', { ascending: true }),
    sb.from('societies').select('*').order('nombre'),
    sb.from('services').select('*').order('nombre'),
    sb.from('invoice_terms').select('*').order('nombre'),
    sb.from('categories').select('*').order('nombre'),
    sb.from('qb_items').select('*').order('nombre_interno'),
    sb.from('directores').select('*').order('nombre'),
    sb.from('cases').select('*').order('fecha_caso', { ascending: false }),
    sb.from('case_comments').select('*').order('created_at'),
    sb.from('case_expenses').select('*').order('fecha'),
    sb.from('case_invoices').select('*').order('fecha_factura'),
    sb.from('invoice_lines').select('*'),
  ]);

  const loadWarnings: string[] = [];
  const warn = (label: string, err: { message: string } | null) => {
    if (err) loadWarnings.push(`${label}: ${err.message}`);
  };

  warn('clients', clientsRes.error);
  warn('societies', societiesRes.error);
  warn('services', servicesRes.error);
  warn('invoice_terms', termsRes.error);
  warn('categories', categoriesRes.error);
  warn('qb_items', qbRes.error);
  warn('directores', directoresRes.error);
  warn('cases', casesRes.error);
  warn('case_comments', commentsRes.error);
  warn('case_expenses', expensesRes.error);
  warn('case_invoices', invoicesRes.error);
  warn('invoice_lines', linesRes.error);

  const anySuccess = [
    clientsRes,
    societiesRes,
    servicesRes,
    termsRes,
    categoriesRes,
    qbRes,
    directoresRes,
    casesRes,
    commentsRes,
    expensesRes,
    invoicesRes,
    linesRes,
  ].some(r => !r.error);

  if (!anySuccess) {
    const err0 = clientsRes.error ?? societiesRes.error ?? directoresRes.error ?? casesRes.error;
    throw err0 ?? new Error('Supabase: no se pudo leer ninguna tabla');
  }

  const clients = clientsRes.error ? [] : (clientsRes.data ?? []).map(r => rowToClient(r as Record<string, unknown>));
  const societies = societiesRes.error ? [] : (societiesRes.data ?? []).map(r => rowToSociety(r as Record<string, unknown>));
  const services = servicesRes.error ? [] : (servicesRes.data ?? []).map(r => rowToService(r as Record<string, unknown>));
  const invoiceTerms = termsRes.error ? [] : (termsRes.data ?? []).map(r => rowToInvoiceTerm(r as Record<string, unknown>));
  const categories = categoriesRes.error ? [] : (categoriesRes.data ?? []).map(r => rowToCategory(r as Record<string, unknown>));
  const qbItems = qbRes.error ? [] : (qbRes.data ?? []).map(r => rowToQBItem(r as Record<string, unknown>));
  const directores = directoresRes.error ? [] : (directoresRes.data ?? []).map(r => rowToDirector(r as Record<string, unknown>));

  const commentsByCase = new Map<string, CaseComment[]>();
  for (const r of commentsRes.error ? [] : (commentsRes.data ?? [])) {
    const c = rowToComment(r as Record<string, unknown>);
    const list = commentsByCase.get(c.case_id) ?? [];
    list.push(c);
    commentsByCase.set(c.case_id, list);
  }

  const expensesByCase = new Map<string, CaseExpense[]>();
  for (const r of expensesRes.error ? [] : (expensesRes.data ?? [])) {
    const e = rowToExpense(r as Record<string, unknown>);
    const list = expensesByCase.get(e.case_id) ?? [];
    list.push(e);
    expensesByCase.set(e.case_id, list);
  }

  const linesByInvoice = new Map<string, InvoiceLine[]>();
  for (const r of linesRes.error ? [] : (linesRes.data ?? [])) {
    const invId = String((r as Record<string, unknown>).invoice_id);
    const list = linesByInvoice.get(invId) ?? [];
    list.push(rowToInvoiceLine(r as Record<string, unknown>));
    linesByInvoice.set(invId, list);
  }

  const invoicesByCase = new Map<string, CaseInvoice[]>();
  for (const r of invoicesRes.error ? [] : (invoicesRes.data ?? [])) {
    const inv = r as Record<string, unknown>;
    const id = String(inv.id);
    const lines = linesByInvoice.get(id) ?? [];
    const ci = rowToInvoice(inv, lines);
    const list = invoicesByCase.get(ci.case_id) ?? [];
    list.push(ci);
    invoicesByCase.set(ci.case_id, list);
  }

  const cases = (casesRes.error ? [] : (casesRes.data ?? [])).map(r => {
    const row = r as Record<string, unknown>;
    const id = String(row.id);
    return rowToCase(row, {
      comments: commentsByCase.get(id) ?? [],
      expenses: expensesByCase.get(id) ?? [],
      invoices: invoicesByCase.get(id) ?? [],
    });
  });

  return { clients, societies, services, invoiceTerms, categories, qbItems, directores, cases, loadWarnings };
}

export async function insertCase(sb: SupabaseClient, c: Case) {
  const { error } = await sb.from('cases').insert(caseToRow(c));
  return { error };
}

export async function updateCaseRow(sb: SupabaseClient, c: Case) {
  const { error } = await sb.from('cases').update(caseToRow(c)).eq('id', c.id);
  return { error };
}

export async function deleteCaseRow(sb: SupabaseClient, id: string) {
  const { error } = await sb.from('cases').delete().eq('id', id);
  return { error };
}

export async function insertComment(sb: SupabaseClient, comment: CaseComment) {
  const { error } = await sb.from('case_comments').insert({
    id: comment.id,
    case_id: comment.case_id,
    user_name: comment.user_name,
    comentario: comment.comentario,
    created_at: comment.created_at,
  });
  return { error };
}

export async function replaceCaseExpenses(sb: SupabaseClient, caseId: string, expenses: CaseExpense[]) {
  const { error: delErr } = await sb.from('case_expenses').delete().eq('case_id', caseId);
  if (delErr) return { error: delErr };
  if (!expenses.length) return { error: null };
  const rows = expenses.map(e => ({
    id: e.id,
    case_id: caseId,
    descripcion: e.descripcion,
    cantidad: e.cantidad,
    importe: e.importe,
    fecha: e.fecha,
    observaciones: e.observaciones ?? null,
  }));
  const { error } = await sb.from('case_expenses').insert(rows);
  return { error };
}

export async function insertExpense(sb: SupabaseClient, caseId: string, expense: CaseExpense) {
  return sb.from('case_expenses').insert({
    id: expense.id,
    case_id: caseId,
    descripcion: expense.descripcion,
    cantidad: expense.cantidad,
    importe: expense.importe,
    fecha: expense.fecha,
    observaciones: expense.observaciones ?? null,
  });
}

export async function insertClient(sb: SupabaseClient, c: Client) {
  return sb.from('clients').insert(clientToRow(c));
}

export async function updateClientRow(sb: SupabaseClient, c: Client) {
  return sb.from('clients').update(clientToRow(c)).eq('id', c.id);
}

export async function deleteClientRow(sb: SupabaseClient, id: string) {
  return sb.from('clients').delete().eq('id', id);
}

export async function insertSociety(sb: SupabaseClient, s: Society) {
  return sb.from('societies').insert(societyToRow(s));
}

export async function updateSocietyRow(sb: SupabaseClient, s: Society) {
  return sb.from('societies').update(societyToRow(s)).eq('id', s.id);
}

export async function deleteSocietyRow(sb: SupabaseClient, id: string) {
  return sb.from('societies').delete().eq('id', id);
}

export async function insertService(sb: SupabaseClient, s: Service) {
  return sb.from('services').insert(serviceToRow(s));
}

export async function updateServiceRow(sb: SupabaseClient, s: Service) {
  return sb.from('services').update(serviceToRow(s)).eq('id', s.id);
}

export async function deleteServiceRow(sb: SupabaseClient, id: string) {
  return sb.from('services').delete().eq('id', id);
}

export async function insertInvoiceTerm(sb: SupabaseClient, t: InvoiceTerm) {
  return sb.from('invoice_terms').insert(invoiceTermToRow(t));
}

export async function updateInvoiceTermRow(sb: SupabaseClient, t: InvoiceTerm) {
  return sb.from('invoice_terms').update(invoiceTermToRow(t)).eq('id', t.id);
}

export async function deleteInvoiceTermRow(sb: SupabaseClient, id: string) {
  return sb.from('invoice_terms').delete().eq('id', id);
}

export async function insertCategory(sb: SupabaseClient, c: Category) {
  return sb.from('categories').insert(categoryToRow(c));
}

export async function updateCategoryRow(sb: SupabaseClient, c: Category) {
  return sb.from('categories').update(categoryToRow(c)).eq('id', c.id);
}

export async function deleteCategoryRow(sb: SupabaseClient, id: string) {
  return sb.from('categories').delete().eq('id', id);
}

export async function insertQBItem(sb: SupabaseClient, q: QBItem) {
  return sb.from('qb_items').insert(qbItemToRow(q));
}

export async function updateQBItemRow(sb: SupabaseClient, q: QBItem) {
  return sb.from('qb_items').update(qbItemToRow(q)).eq('id', q.id);
}

export async function deleteQBItemRow(sb: SupabaseClient, id: string) {
  return sb.from('qb_items').delete().eq('id', id);
}

export async function insertDirector(sb: SupabaseClient, d: Director) {
  return sb.from('directores').insert(directorToRow(d));
}

export async function updateDirectorRow(sb: SupabaseClient, d: Director) {
  return sb.from('directores').update(directorToRow(d)).eq('id', d.id);
}

export async function deleteDirectorRow(sb: SupabaseClient, id: string) {
  return sb.from('directores').delete().eq('id', id);
}
