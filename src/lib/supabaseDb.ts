import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Case,
  CaseComment,
  CaseExpense,
  CaseInvoice,
  Category,
  Client,
  Director,
  Etapa,
  InvoiceLine,
  InvoiceTerm,
  QBItem,
  Service,
  ServiceItem,
  Society,
  TipoSociedad,
  TipoDocumentoDirector,
  Usuario,
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
    qbo_sync_status: row.qbo_sync_status ? (String(row.qbo_sync_status) as Society['qbo_sync_status']) : undefined,
    qbo_sync_attempts: row.qbo_sync_attempts != null ? Number(row.qbo_sync_attempts) : undefined,
    qbo_sync_last_error: row.qbo_sync_last_error ? String(row.qbo_sync_last_error) : undefined,
    qbo_sync_last_attempt_at: row.qbo_sync_last_attempt_at ? String(row.qbo_sync_last_attempt_at) : undefined,
    qbo_sync_last_success_at: row.qbo_sync_last_success_at ? String(row.qbo_sync_last_success_at) : undefined,
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
    qbo_sync_status: s.qbo_sync_status ?? null,
    qbo_sync_attempts: s.qbo_sync_attempts ?? null,
    qbo_sync_last_error: s.qbo_sync_last_error ?? null,
    qbo_sync_last_attempt_at: s.qbo_sync_last_attempt_at ?? null,
    qbo_sync_last_success_at: s.qbo_sync_last_success_at ?? null,
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
    activo: s.activo,
    ...(s.created_at ? { created_at: s.created_at.includes('T') ? s.created_at : `${s.created_at}T12:00:00Z` } : {}),
  };
}

export function rowToServiceItem(row: Record<string, unknown>): ServiceItem {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    service_id: row.service_id ? String(row.service_id) : undefined,
    tipo_item: String(row.tipo_item ?? 'N/A'),
    id_qb: row.id_qb != null ? Number(row.id_qb) : undefined,
    sku: row.sku ? String(row.sku) : undefined,
    descripcion: row.descripcion ? String(row.descripcion) : undefined,
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function serviceItemToRow(si: ServiceItem): Record<string, unknown> {
  return {
    id: si.id,
    nombre: si.nombre,
    service_id: si.service_id ?? null,
    tipo_item: si.tipo_item,
    id_qb: si.id_qb ?? null,
    sku: si.sku ?? null,
    descripcion: si.descripcion ?? null,
    activo: si.activo,
    ...(si.created_at ? { created_at: si.created_at.includes('T') ? si.created_at : `${si.created_at}T12:00:00Z` } : {}),
  };
}

export function rowToUsuario(row: Record<string, unknown>): Usuario {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    correo: String(row.correo),
    rol: row.rol ? String(row.rol) : undefined,
    puesto: row.puesto ? String(row.puesto) : undefined,
    correo_microsoft: row.correo_microsoft ? String(row.correo_microsoft) : undefined,
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function usuarioToRow(u: Usuario): Record<string, unknown> {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol ?? null,
    puesto: u.puesto ?? null,
    correo_microsoft: u.correo_microsoft ?? null,
    activo: u.activo,
    ...(u.created_at ? { created_at: u.created_at.includes('T') ? u.created_at : `${u.created_at}T12:00:00Z` } : {}),
  };
}

export function rowToEtapa(row: Record<string, unknown>): Etapa {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    n_etapa: Number(row.n_etapa ?? 0),
    activo: Boolean(row.activo),
    created_at: row.created_at ? isoDate(String(row.created_at)) : undefined,
  };
}

export function etapaToRow(e: Etapa): Record<string, unknown> {
  return {
    id: e.id,
    nombre: e.nombre,
    n_etapa: e.n_etapa,
    activo: e.activo,
    ...(e.created_at ? { created_at: e.created_at.includes('T') ? e.created_at : `${e.created_at}T12:00:00Z` } : {}),
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
    invoice_id: row.invoice_id ? String(row.invoice_id) : undefined,
    servicio_id: row.servicio_id ? String(row.servicio_id) : undefined,
    qb_item_id: row.qb_item_id ? String(row.qb_item_id) : undefined,
    descripcion: String(row.descripcion),
    cantidad,
    tarifa,
    importe: cantidad * tarifa,
    itbms: Number(row.itbms ?? 0),
    categoria: row.categoria ? String(row.categoria) : undefined,
  };
}

function rowToInvoice(row: Record<string, unknown>, lines: InvoiceLine[]): CaseInvoice {
  return {
    id: String(row.id),
    case_id: row.case_id != null ? String(row.case_id) : undefined,
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
    numero_factura: row.numero_factura ? String(row.numero_factura) : undefined,
    nota_cliente: row.nota_cliente ? String(row.nota_cliente) : undefined,
    error_detalle: row.error_detalle ? String(row.error_detalle) : undefined,
    qb_total: row.qb_total != null ? Number(row.qb_total) : undefined,
    qb_balance: row.qb_balance != null ? Number(row.qb_balance) : undefined,
    qb_last_sync_at: row.qb_last_sync_at ? String(row.qb_last_sync_at) : undefined,
    pdf_path: row.pdf_path ? String(row.pdf_path) : undefined,
    pdf_url_signed_last: row.pdf_url_signed_last ? String(row.pdf_url_signed_last) : undefined,
    pdf_synced_at: row.pdf_synced_at ? String(row.pdf_synced_at) : undefined,
    pdf_status: row.pdf_status ? (row.pdf_status as CaseInvoice['pdf_status']) : undefined,
    lines,
  };
}

function rowToCase(row: Record<string, unknown>, nest: {
  comments: CaseComment[];
  expenses: CaseExpense[];
  invoices: CaseInvoice[];
}): Case {
  const prioridad = (row.prioridad as Case['prioridad']) ?? undefined;
  return {
    id: String(row.id),
    n_tarea: row.n_tarea != null ? Number(row.n_tarea) : undefined,
    numero_caso: String(row.numero_caso ?? ''),
    client_id: row.client_id ? String(row.client_id) : undefined,
    society_id: row.society_id ? String(row.society_id) : undefined,
    service_id: row.service_id ? String(row.service_id) : undefined,
    service_item_id: row.service_item_id ? String(row.service_item_id) : undefined,
    descripcion: String(row.descripcion ?? ''),
    estado: (row.estado as Case['estado']) ?? 'Pendiente',
    etapa_id: row.etapa_id ? String(row.etapa_id) : undefined,
    etapa: row.etapa ? String(row.etapa) : undefined,
    gastos_cotizados: Number(row.gastos_cotizados ?? 0),
    gastos_cliente: row.gastos_cliente != null ? Number(row.gastos_cliente) : undefined,
    gastos_pendiente: row.gastos_pendiente != null ? Number(row.gastos_pendiente) : undefined,
    cliente_temporal: Boolean(row.cliente_temporal),
    prioridad,
    prioridad_urgente: prioridad === 'Urgente' || Boolean(row.prioridad_urgente),
    creado_por: String(row.creado_por ?? ''),
    responsable: String(row.responsable ?? ''),
    usuario_asignado_id: row.usuario_asignado_id ? String(row.usuario_asignado_id) : undefined,
    observaciones: String(row.observaciones ?? ''),
    notas: row.notas ? String(row.notas) : undefined,
    fecha_caso: String(row.fecha_caso ?? ''),
    fecha_vencimiento: row.fecha_vencimiento ? String(row.fecha_vencimiento) : undefined,
    recurrencia: row.recurrencia != null ? Boolean(row.recurrencia) : undefined,
    envio_correo: row.envio_correo != null ? Boolean(row.envio_correo) : undefined,
    created_at: isoDate(String(row.created_at ?? '')),
    comments: nest.comments,
    expenses: nest.expenses,
    invoices: nest.invoices,
  };
}

export function caseToRow(c: Case): Record<string, unknown> {
  return {
    id: c.id,
    n_tarea: c.n_tarea ?? null,
    numero_caso: c.numero_caso,
    client_id: uuidOrNull(c.client_id),
    society_id: uuidOrNull(c.society_id),
    service_id: uuidOrNull(c.service_id),
    service_item_id: uuidOrNull(c.service_item_id),
    descripcion: c.descripcion,
    estado: c.estado,
    etapa_id: uuidOrNull(c.etapa_id),
    etapa: c.etapa ?? '',   // NOT NULL en BD legacy — nunca enviar null
    gastos_cotizados: c.gastos_cotizados,
    gastos_cliente: c.gastos_cliente ?? null,
    gastos_pendiente: c.gastos_pendiente ?? null,
    cliente_temporal: c.cliente_temporal,
    prioridad: c.prioridad ?? null,
    prioridad_urgente: c.prioridad === 'Urgente' || c.prioridad_urgente,
    creado_por: c.creado_por,
    responsable: c.responsable,
    usuario_asignado_id: uuidOrNull(c.usuario_asignado_id),
    observaciones: c.observaciones,
    notas: c.notas ?? null,
    fecha_caso: c.fecha_caso,
    fecha_vencimiento: c.fecha_vencimiento ?? null,
    recurrencia: c.recurrencia ?? false,
    envio_correo: c.envio_correo ?? false,
    created_at: c.created_at.includes('T') ? c.created_at : `${c.created_at}T12:00:00Z`,
  };
}

export type LoadAllFromSupabaseResult = {
  clients: Client[];
  societies: Society[];
  services: Service[];
  serviceItems: ServiceItem[];
  etapas: Etapa[];
  usuarios: Usuario[];
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
    serviceItemsRes,
    etapasRes,
    usuariosRes,
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
    sb.from('service_items').select('*').order('nombre'),
    sb.from('etapas').select('*').order('n_etapa', { ascending: true }),
    sb.from('usuarios').select('*').order('nombre'),
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
  warn('service_items', serviceItemsRes.error);
  warn('etapas', etapasRes.error);
  warn('usuarios', usuariosRes.error);
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
    serviceItemsRes,
    etapasRes,
    usuariosRes,
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
  const serviceItems = serviceItemsRes.error ? [] : (serviceItemsRes.data ?? []).map(r => rowToServiceItem(r as Record<string, unknown>));
  const etapas = etapasRes.error ? [] : (etapasRes.data ?? []).map(r => rowToEtapa(r as Record<string, unknown>));
  const usuarios = usuariosRes.error ? [] : (usuariosRes.data ?? []).map(r => rowToUsuario(r as Record<string, unknown>));
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
  const allInvoices: CaseInvoice[] = [];
  for (const r of invoicesRes.error ? [] : (invoicesRes.data ?? [])) {
    const inv = r as Record<string, unknown>;
    const id = String(inv.id);
    const lines = linesByInvoice.get(id) ?? [];
    const ci = rowToInvoice(inv, lines);
    allInvoices.push(ci);
    // solo agrupar por caso si tiene case_id válido
    if (ci.case_id) {
      const list = invoicesByCase.get(ci.case_id) ?? [];
      list.push(ci);
      invoicesByCase.set(ci.case_id, list);
    }
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

  return { clients, societies, services, serviceItems, etapas, usuarios, invoiceTerms, categories, qbItems, directores, cases, allInvoices, loadWarnings };
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
  /**
   * IMPORTANTE (Supabase/Postgres):
   * - `clients.numero` se asigna por secuencia (`clients_numero_seq`). NO enviar `numero` desde frontend.
   * - Si RLS se habilita en `public.clients`, se requiere policy de INSERT para `authenticated`.
   *
   * FIX típico si falla por duplicado en `numero`:
   *   SELECT setval('public.clients_numero_seq', (SELECT coalesce(max(numero), 0) FROM public.clients), true);
   */
  const row = clientToRow(c);
  // Asegurar que jamás enviamos `numero` en el insert.
  const { numero: _numero, ...safeRow } = row as Record<string, unknown>;
  console.log('[insertClient] INSERT CLIENT PAYLOAD:', safeRow);
  console.time('[insertClient] INSERT');

  const res = await sb.from('clients').insert(safeRow).select('*').single();
  console.timeEnd('[insertClient] INSERT');
  console.log('[insertClient] INSERT RESULT:', { data: res.data, error: res.error });
  if (res.error) {
    console.error('[insertClient] SUPABASE INSERT ERROR:', res.error);
    throw res.error;
  }
  return res;
}

/** Test rápido de latencia: SELECT mínimo a `clients` (sin cambiar lógica de negocio). */
export async function testClientsSelectLatency(sb: SupabaseClient) {
  console.time('[testClientsSelectLatency] SELECT clients');
  const res = await sb.from('clients').select('id').limit(1);
  console.timeEnd('[testClientsSelectLatency] SELECT clients');
  console.log('[testClientsSelectLatency] RESULT:', { data: res.data, error: res.error });
  return res;
}

export async function updateClientRow(sb: SupabaseClient, c: Client) {
  const res = await sb.from('clients').update(clientToRow(c)).eq('id', c.id).select('*').single();
  if (res.error) {
    console.error('[updateClientRow] SUPABASE ERROR:', res.error);
    throw res.error;
  }
  return res;
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

export async function insertUsuario(sb: SupabaseClient, u: Usuario) {
  return sb.from('usuarios').insert(usuarioToRow(u));
}

export async function updateUsuarioRow(sb: SupabaseClient, u: Usuario) {
  return sb.from('usuarios').update(usuarioToRow(u)).eq('id', u.id);
}

export async function deleteUsuarioRow(sb: SupabaseClient, id: string) {
  return sb.from('usuarios').delete().eq('id', id);
}

export async function insertEtapa(sb: SupabaseClient, e: Etapa) {
  return sb.from('etapas').insert(etapaToRow(e));
}

export async function updateEtapaRow(sb: SupabaseClient, e: Etapa) {
  return sb.from('etapas').update(etapaToRow(e)).eq('id', e.id);
}

export async function deleteEtapaRow(sb: SupabaseClient, id: string) {
  return sb.from('etapas').delete().eq('id', id);
}

export async function insertServiceItem(sb: SupabaseClient, si: ServiceItem) {
  return sb.from('service_items').insert(serviceItemToRow(si));
}

export async function updateServiceItemRow(sb: SupabaseClient, si: ServiceItem) {
  return sb.from('service_items').update(serviceItemToRow(si)).eq('id', si.id);
}

export async function deleteServiceItemRow(sb: SupabaseClient, id: string) {
  return sb.from('service_items').delete().eq('id', id);
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
  // Devolver la fila insertada para obtener defaults/normalización del servidor
  return sb.from('directores').insert(directorToRow(d)).select('*').single();
}

export async function updateDirectorRow(sb: SupabaseClient, d: Director) {
  return sb.from('directores').update(directorToRow(d)).eq('id', d.id);
}

export async function deleteDirectorRow(sb: SupabaseClient, id: string) {
  return sb.from('directores').delete().eq('id', id);
}

// ─── Facturas (case_invoices + invoice_lines) ────────────────────────────────

/** Evita enviar strings no-uuid a columnas uuid (Postgres rechaza). */
function uuidOrNull(v: string | undefined | null): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  // Acepta UUID v1–v5
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return null;
  return s;
}

function invoiceToRow(inv: CaseInvoice): Record<string, unknown> {
  return {
    id: inv.id,
    case_id: uuidOrNull(inv.case_id ?? null),
    client_id: uuidOrNull(inv.client_id ?? null),
    society_id: uuidOrNull(inv.society_id ?? null),
    term_id: uuidOrNull(inv.term_id ?? null),
    fecha_factura: inv.fecha_factura,
    fecha_vencimiento: inv.fecha_vencimiento,
    subtotal: inv.subtotal,
    impuesto: inv.impuesto,
    total: inv.total,
    estado: inv.estado,
    qb_invoice_id: inv.qb_invoice_id ?? null,
    numero_factura: inv.numero_factura ?? null,
    nota_cliente: inv.nota_cliente ?? null,
    error_detalle: inv.error_detalle ?? null,
    qb_total: inv.qb_total ?? null,
    qb_balance: inv.qb_balance ?? null,
    qb_last_sync_at: inv.qb_last_sync_at ?? null,
    pdf_path: inv.pdf_path ?? null,
    pdf_url_signed_last: inv.pdf_url_signed_last ?? null,
    pdf_synced_at: inv.pdf_synced_at ?? null,
    pdf_status: inv.pdf_status ?? null,
  };
}

function lineToRow(line: InvoiceLine, invoiceId: string): Record<string, unknown> {
  return {
    id: line.id,
    invoice_id: invoiceId,
    servicio_id: uuidOrNull(line.servicio_id ?? null),
    qb_item_id: uuidOrNull(line.qb_item_id ?? null),
    descripcion: line.descripcion,
    cantidad: line.cantidad,
    tarifa: line.tarifa,
    itbms: line.itbms,
    categoria: line.categoria ?? null,
  };
}

export async function insertInvoice(sb: SupabaseClient, inv: CaseInvoice) {
  const { error } = await sb.from('case_invoices').insert(invoiceToRow(inv));
  if (error) return { error };
  if (inv.lines.length > 0) {
    const { error: le } = await sb.from('invoice_lines').insert(inv.lines.map(l => lineToRow(l, inv.id)));
    if (le) {
      await sb.from('case_invoices').delete().eq('id', inv.id);
      return { error: le };
    }
  }
  return { error: null };
}

export async function updateInvoice(sb: SupabaseClient, inv: CaseInvoice) {
  const { error } = await sb.from('case_invoices').update(invoiceToRow(inv)).eq('id', inv.id);
  if (error) return { error };
  // Replace lines: delete old, insert new
  await sb.from('invoice_lines').delete().eq('invoice_id', inv.id);
  if (inv.lines.length > 0) {
    const { error: le } = await sb.from('invoice_lines').insert(inv.lines.map(l => lineToRow(l, inv.id)));
    if (le) return { error: le };
  }
  return { error: null };
}

export async function deleteInvoiceRow(sb: SupabaseClient, invoiceId: string) {
  return sb.from('case_invoices').delete().eq('id', invoiceId);
}
