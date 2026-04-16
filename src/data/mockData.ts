export interface Client {
  id: string;
  /** Nombre cliente (pantalla principal / Anc_Clientes). */
  nombre: string;
  /** Razón social o nombre fiscal. */
  razon_social: string;
  /** Correlativo de negocio (columna ID en listados). */
  numero?: number;
  email: string;
  telefono: string;
  identificacion: string;
  direccion: string;
  quickbooks_customer_id?: string;
  tipo_cliente?: string;
  activo: boolean;
  observaciones?: string;
  created_at: string;
}

export type TipoSociedad = 'SOCIEDADES' | 'FUNDACIONES' | 'B.V.I';

export const TIPOS_SOCIEDAD: TipoSociedad[] = ['SOCIEDADES', 'FUNDACIONES', 'B.V.I'];

/** Semestre fiscal según mes de la fecha de inscripción (1–6 → 1, 7–12 → 2). */
export function semestreFromFechaInscripcion(iso?: string | null): 1 | 2 | null {
  if (!iso?.trim()) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  if (m >= 1 && m <= 6) return 1;
  return 2;
}

export interface Society {
  id: string;
  client_id: string;
  /** Nombre sociedad (listado principal). */
  nombre: string;
  razon_social: string;
  tipo_sociedad: TipoSociedad;
  correo: string;
  telefono: string;
  id_qb?: number | null;
  ruc: string;
  dv: string;
  nit: string;
  presidente_id?: string | null;
  tesorero_id?: string | null;
  secretario_id?: string | null;
  pago_tasa_unica: string;
  /** Fecha inscripción (YYYY-MM-DD). El semestre se deriva en UI (1–6 → 1, 7–12 → 2). */
  fecha_inscripcion?: string;
  identificacion_fiscal?: string;
  quickbooks_customer_id?: string;
  activo: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  nombre: string;
  categoria: string;
  category_id?: string;
  id_qb?: number;
  activo: boolean;
  created_at?: string;
}

export const ROLES_USUARIO = [
  'Socio',
  'Abogada',
  'Asistente Legal',
  'Asistente Administrativo',
  'Contabilidad',
  'Cumplimiento',
  'Soporte',
] as const;

export const TIPOS_CLIENTE = ['Persona Natural', 'Persona Juridica', 'PEP'] as const;
export type TipoCliente = typeof TIPOS_CLIENTE[number];

export type RolUsuario = typeof ROLES_USUARIO[number];

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol?: string;
  puesto?: string;
  correo_microsoft?: string;
  activo: boolean;
  created_at?: string;
}

export const mockUsuarios: Usuario[] = [
  { id: 'u1', nombre: 'Leydis Valdés',       correo: 'finanzas@ancori.com',       rol: 'Contabilidad',            correo_microsoft: 'lvaldes@Ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u2', nombre: 'Jean Richa',           correo: 'jricha@ancori.com',         rol: 'Socio',                   correo_microsoft: 'jricha@Ancoriyasociados.onmicrosoft.com',     activo: true },
  { id: 'u3', nombre: 'Margie Angel',         correo: 'mangel@ancori.com',         rol: 'Socio',                   correo_microsoft: 'mangel@Ancoriyasociados.onmicrosoft.com',     activo: true },
  { id: 'u4', nombre: 'Yolimar Gordón',       correo: 'ygordon@ancori.com',        rol: 'Abogada',                 correo_microsoft: 'ygordon@Ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u5', nombre: 'Milagros Flores',      correo: 'mflores@ancori.com',        rol: 'Abogada',                 correo_microsoft: 'mflores@Ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u6', nombre: 'María Isabel Palma',   correo: 'mpalma@ancori.com',         rol: 'Asistente Legal',         correo_microsoft: 'mipalma@Ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u7', nombre: 'Vanessa Suarez',       correo: 'administracion@ancori.com', rol: 'Asistente Administrativo',correo_microsoft: 'vsuarez@Ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u8', nombre: 'Soporte',              correo: 'soporte@ancoriyasociados.com',                              correo_microsoft: 'soporte@ancoriyasociados.onmicrosoft.com',    activo: true },
  { id: 'u9', nombre: 'Soporte Ct Auditores', correo: 'panelbi@ctauditoresbi.onmicrosoft.com',                     correo_microsoft: 'panelbi@ctauditoresbi.onmicrosoft.com',       activo: true },
];

export const TIPOS_ITEM = [
  'N/A',
  'Reformas al Pacto',
  'Reformas al Acta Fundacional',
  'Emision de Poder General o Especial',
  'Bien Inmueble',
  'Acciones',
] as const;

export type TipoItem = typeof TIPOS_ITEM[number];

export interface ServiceItem {
  id: string;
  nombre: string;
  service_id?: string;
  tipo_item: string;
  id_qb?: number;
  sku?: string;
  descripcion?: string;
  activo: boolean;
  created_at?: string;
}

export const mockServiceItems: ServiceItem[] = [
  { id: 'si1', nombre: 'Constitución', service_id: '1', tipo_item: 'N/A', activo: true },
  { id: 'si2', nombre: 'Cambio de Nombre', service_id: '1', tipo_item: 'Reformas al Pacto', activo: true },
  { id: 'si3', nombre: 'Cambio de Junta Directiva', service_id: '1', tipo_item: 'Reformas al Pacto', id_qb: 72, sku: '400001-1', descripcion: 'HONORARIOS', activo: true },
];

export interface CaseComment {
  id: string;
  case_id: string;
  user_name: string;
  comentario: string;
  created_at: string;
}

export interface CaseExpense {
  id: string;
  case_id: string;
  descripcion: string;
  cantidad: number;
  importe: number;
  total: number;
  fecha: string;
  observaciones?: string;
}

export interface InvoiceTerm {
  id: string;
  nombre: string;
  dias_vencimiento: number;
  activo: boolean;
  created_at?: string;
}

export interface Etapa {
  id: string;
  nombre: string;
  n_etapa: number;
  activo: boolean;
  created_at?: string;
}

export const mockEtapas: Etapa[] = [
  { id: 'e1', nombre: 'Solicitud',                       n_etapa: 1, activo: true },
  { id: 'e2', nombre: 'Evaluacion',                      n_etapa: 2, activo: true },
  { id: 'e3', nombre: 'Asignacion de Clasificacion',     n_etapa: 3, activo: true },
  { id: 'e4', nombre: 'Envio Cotizacion',                n_etapa: 4, activo: true },
  { id: 'e5', nombre: 'Recepcion Cotizacion del Cliente',n_etapa: 5, activo: true },
  { id: 'e6', nombre: 'Recepcion de Respuesta',          n_etapa: 6, activo: true },
  { id: 'e7', nombre: 'Asignacion Abogado',              n_etapa: 7, activo: true },
  { id: 'e8', nombre: 'Envio a Cumplimiento',            n_etapa: 8, activo: true },
];

/** Categoría de servicio / clasificación (mapeo ID QuickBooks en id_qb). */
export interface Category {
  id: string;
  nombre: string;
  id_qb?: number | null;
  activo: boolean;
  created_at: string;
}

export interface QBItem {
  id: string;
  nombre_interno: string;
  nombre_qb: string;
  qb_item_id?: string;
  tipo: string;
  impuesto_default?: number;
  activo: boolean;
  created_at?: string;
}

export type TipoDocumentoDirector = 'Cedula' | 'Pasaporte' | 'Otro';

export const TIPOS_DOCUMENTO_DIRECTOR: TipoDocumentoDirector[] = ['Cedula', 'Pasaporte', 'Otro'];

export interface Director {
  id: string;
  /** Nombre del director (columna Título / nombre en listas). */
  nombre: string;
  comentarios: string;
  activo: boolean;
  /** Fecha de vencimiento del documento de identidad (YYYY-MM-DD). */
  fecha_vencimiento_documento?: string;
  tipo_documento: TipoDocumentoDirector;
  created_at: string;
}

export interface CaseInvoice {
  id: string;
  /** Vacío o ausente si la factura no está vinculada a un caso. */
  case_id?: string;
  client_id?: string;
  society_id?: string;
  term_id?: string;
  fecha_factura: string;
  fecha_vencimiento: string;
  subtotal: number;
  impuesto: number;
  total: number;
  estado: 'borrador' | 'pendiente' | 'enviada' | 'error' | 'anulada';
  qb_invoice_id?: string;
  numero_factura?: string;
  nota_cliente?: string;
  /** Último error al enviar o sincronizar con QuickBooks. */
  error_detalle?: string;
  /** TotalAmt en QBO (última sync). */
  qb_total?: number;
  /** Balance (saldo pendiente) en QBO. */
  qb_balance?: number;
  qb_last_sync_at?: string;
  pdf_path?: string;
  pdf_url_signed_last?: string;
  pdf_synced_at?: string;
  pdf_status?: 'pending' | 'ok' | 'error';
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id?: string;
  servicio_id?: string;
  qb_item_id?: string;
  descripcion: string;
  cantidad: number;
  tarifa: number;
  importe: number;
  itbms: number;
  categoria?: string;
}

export type CaseEstado = 'Pendiente' | 'En Curso' | 'Completado/Facturado' | 'Cancelado';
export type CasePrioridad = 'Baja' | 'Media' | 'Urgente';

export const CASE_ESTADOS: CaseEstado[] = ['Pendiente', 'En Curso', 'Completado/Facturado', 'Cancelado'];
export const CASE_PRIORIDADES: CasePrioridad[] = ['Baja', 'Media', 'Urgente'];

/** Formatea n_tarea como "0000130" (7 dígitos con ceros). */
export function formatNTarea(n?: number): string {
  if (!n) return '—';
  return String(n).padStart(7, '0');
}

export interface Case {
  id: string;
  /** Correlativo numérico interno (1, 2, 3…). Se muestra como 0000001. */
  n_tarea?: number;
  /** Código de visualización derivado de n_tarea. */
  numero_caso: string;
  client_id?: string;
  society_id?: string;
  /** Servicio derivado del item de servicio o seleccionado manualmente. */
  service_id?: string;
  /** FK → service_items.id */
  service_item_id?: string;
  descripcion: string;
  estado: CaseEstado;
  /** FK → etapas.id */
  etapa_id?: string;
  /** @deprecated usa etapa_id */
  etapa?: string;
  gastos_cotizados: number;
  /** Gastos del cliente en el caso. */
  gastos_cliente?: number;
  /** Gastos pendientes por cobrar. */
  gastos_pendiente?: number;
  cliente_temporal: boolean;
  /** Derived: prioridad === 'Urgente'. Mantenido para compatibilidad. */
  prioridad_urgente: boolean;
  prioridad?: CasePrioridad;
  creado_por: string;
  responsable: string;
  /** FK → usuarios.id */
  usuario_asignado_id?: string;
  observaciones: string;
  notas?: string;
  fecha_caso: string;
  /** Fecha límite / vencimiento del caso. */
  fecha_vencimiento?: string;
  recurrencia?: boolean;
  /** Indica si se envió correo al cliente. */
  envio_correo?: boolean;
  created_at: string;
  comments: CaseComment[];
  expenses: CaseExpense[];
  invoices: CaseInvoice[];
}

export const mockClients: Client[] = [
  { id: '1', nombre: 'SAUL SASSON', razon_social: 'SAUL SASSON', numero: 1, email: 'saul@email.com', telefono: '+507 6000-1111', identificacion: 'PE-1234', direccion: 'Panamá City', activo: true, created_at: '2024-01-10' },
  { id: '2', nombre: 'ANA MARIA GOMEZ', razon_social: 'ANA MARIA GOMEZ', numero: 2, email: 'ana@email.com', telefono: '+507 6000-2222', identificacion: 'PE-5678', direccion: 'Costa del Este', activo: true, created_at: '2024-01-15' },
  { id: '3', nombre: 'JOSE FERNANDO CADAVID', razon_social: 'JOSE FERNANDO CADAVID', numero: 3, email: 'jose@email.com', telefono: '+507 6000-3333', identificacion: 'PE-9012', direccion: 'Punta Pacífica', activo: true, created_at: '2024-02-01' },
  { id: '4', nombre: 'SUSANA BERENGUER', razon_social: 'SUSANA BERENGUER', numero: 4, email: 'susana@email.com', telefono: '+507 6000-4444', identificacion: 'PE-3456', direccion: 'El Cangrejo', activo: true, created_at: '2024-02-10' },
  { id: '5', nombre: 'JEAN RICHA HOLMES', razon_social: 'JEAN RICHA HOLMES', numero: 5, email: 'jean@email.com', telefono: '+507 6000-5555', identificacion: 'PE-7890', direccion: 'San Francisco', activo: true, created_at: '2024-03-01' },
];

export const mockSocieties: Society[] = [
  { id: '1', client_id: '1', nombre: 'HASANI S.A.', razon_social: 'HASANI SOCIEDAD ANONIMA', tipo_sociedad: 'SOCIEDADES', correo: 'hasani@corp.com', telefono: '+507 300-1111', id_qb: 1001, ruc: '', dv: '', nit: '', presidente_id: 'd1', tesorero_id: 'd2', secretario_id: null, pago_tasa_unica: '', fecha_inscripcion: '2024-03-15', activo: true, created_at: '2024-01-12' },
  { id: '2', client_id: '2', nombre: 'ANA MARIA GOMEZ', razon_social: 'ANA MARIA GOMEZ', tipo_sociedad: 'FUNDACIONES', correo: 'ana@corp.com', telefono: '+507 300-2222', ruc: '', dv: '', nit: '', pago_tasa_unica: 'Sí', fecha_inscripcion: '2023-08-01', activo: true, created_at: '2024-01-16' },
  { id: '3', client_id: '3', nombre: 'ABASA GROUP CORP.', razon_social: 'ABASA GROUP CORPORATION', tipo_sociedad: 'B.V.I', correo: 'abasa@corp.com', telefono: '+507 300-3333', ruc: '123456', dv: '7', nit: '', presidente_id: 'd1', pago_tasa_unica: '', fecha_inscripcion: '2022-01-10', activo: true, created_at: '2024-02-05' },
  { id: '4', client_id: '4', nombre: 'FBBC CORPORATION', razon_social: 'FBBC CORPORATION', tipo_sociedad: 'SOCIEDADES', correo: 'fbbc@corp.com', telefono: '+507 300-4444', ruc: '', dv: '', nit: '', pago_tasa_unica: 'No', fecha_inscripcion: '2024-11-20', activo: true, created_at: '2024-02-15' },
  { id: '5', client_id: '3', nombre: 'DOVLE CINCUENTENARIO 5B-200, S.A.', razon_social: 'DOVLE CINCUENTENARIO 5B-200, S.A.', tipo_sociedad: 'SOCIEDADES', correo: 'dovle@corp.com', telefono: '+507 300-5555', ruc: '', dv: '', nit: '', fecha_inscripcion: '2024-06-01', activo: true, created_at: '2024-03-01' },
];

export const mockServices: Service[] = [
  { id: '1', nombre: 'Constitución Sociedad Anónima', categoria: 'Corporativo', activo: true },
  { id: '2', nombre: 'Emisión de Poder General o Especial', categoria: 'Corporativo', activo: true },
  { id: '3', nombre: 'Certificado de Existencia', categoria: 'Corporativo', activo: true },
  { id: '4', nombre: 'Apostilla de Documento', categoria: 'Legal', activo: true },
];

export const mockInvoiceTerms: InvoiceTerm[] = [
  { id: '1', nombre: 'Pago Inmediato', dias_vencimiento: 0, activo: true },
  { id: '2', nombre: 'Net 15', dias_vencimiento: 15, activo: true },
  { id: '3', nombre: 'Net 30', dias_vencimiento: 30, activo: true },
];

export const mockCategories: Category[] = [
  { id: 'c1', nombre: 'CONSTITUCION DE PERSONA JURÍDICA', id_qb: 55, activo: true, created_at: '2024-01-10' },
  { id: 'c2', nombre: 'SERVICIOS TERCERIZADOS', id_qb: 52, activo: true, created_at: '2024-01-10' },
  { id: 'c3', nombre: 'GASTOS NOTARIA', id_qb: 50, activo: true, created_at: '2024-01-10' },
  { id: 'c4', nombre: 'TRÁMITES REGISTRALES', id_qb: 51, activo: true, created_at: '2024-01-10' },
  { id: 'c5', nombre: 'OTROS SERVICIOS', id_qb: null, activo: true, created_at: '2024-06-01' },
];

export const mockQBItems: QBItem[] = [
  { id: '1', nombre_interno: 'Constitución S.A.', nombre_qb: 'Corp Formation SA', qb_item_id: 'QB-001', tipo: 'Servicio', impuesto_default: 7, activo: true },
  { id: '2', nombre_interno: 'Poder General', nombre_qb: 'Power of Attorney', qb_item_id: 'QB-002', tipo: 'Servicio', impuesto_default: 7, activo: true },
  { id: '3', nombre_interno: 'Certificado Existencia', nombre_qb: 'Good Standing Certificate', qb_item_id: 'QB-003', tipo: 'Servicio', impuesto_default: 7, activo: true },
];

export const mockDirectores: Director[] = [
  { id: 'd1', nombre: 'MARIA ISABEL PALMA', comentarios: '', activo: true, fecha_vencimiento_documento: '2026-12-31', tipo_documento: 'Cedula', created_at: '2024-06-01' },
  { id: 'd2', nombre: 'EYRA RUTH ROMERO', comentarios: 'Notas internas', activo: true, tipo_documento: 'Pasaporte', created_at: '2024-06-15' },
];

export const mockCases: Case[] = [
  {
    id: '1', n_tarea: 6, numero_caso: '0000006', client_id: '1', society_id: '1', service_id: '1',
    service_item_id: 'si1', descripcion: 'Constitución Sociedad Anónima', estado: 'Pendiente',
    etapa_id: 'e7', gastos_cotizados: 5000, gastos_cliente: 5000, cliente_temporal: false,
    prioridad_urgente: false, prioridad: 'Media',
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma', usuario_asignado_id: 'u6',
    observaciones: 'SOCIEDAD NUEVA', notas: 'Ingresó ayer', fecha_caso: '2024-12-10',
    fecha_vencimiento: '2025-01-10', recurrencia: false, envio_correo: false,
    created_at: '2024-12-01',
    comments: [
      { id: '1', case_id: '1', user_name: 'Yolimar Gordón', comentario: 'Caso creado, pendiente de documentos del cliente.', created_at: '2024-12-01T10:00:00' },
    ],
    expenses: [],
    invoices: [],
  },
  {
    id: '2', n_tarea: 5, numero_caso: '0000005', client_id: '2', society_id: '2', service_id: '2',
    service_item_id: 'si3', descripcion: 'Emisión de Poder General o Especial - No Inscrito', estado: 'Pendiente',
    etapa_id: 'e7', gastos_cotizados: 3000, cliente_temporal: false,
    prioridad_urgente: false, prioridad: 'Baja',
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma', usuario_asignado_id: 'u6',
    observaciones: '', fecha_caso: '2024-11-20', created_at: '2024-11-20',
    comments: [],
    expenses: [],
    invoices: [],
  },
  {
    id: '3', n_tarea: 4, numero_caso: '0000004', client_id: '3', society_id: '5', service_id: '1',
    service_item_id: 'si1', descripcion: 'Constitución Sociedad Anónima', estado: 'Completado/Facturado',
    etapa_id: 'e8', gastos_cotizados: 4500, cliente_temporal: false, prioridad_urgente: false, prioridad: 'Media',
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón', usuario_asignado_id: 'u4',
    observaciones: 'Ingresó ayer 9 de dic en curso en rp', fecha_caso: '2024-11-15', created_at: '2024-11-15',
    comments: [
      { id: '2', case_id: '3', user_name: 'Yolimar Gordón', comentario: 'Documentos entregados al cliente.', created_at: '2024-12-08T14:30:00' },
      { id: '3', case_id: '3', user_name: 'María Isabel Palma', comentario: 'Sociedad registrada exitosamente.', created_at: '2024-12-09T09:00:00' },
    ],
    expenses: [
      { id: '1', case_id: '3', descripcion: 'Timbres fiscales', cantidad: 2, importe: 500, total: 1000, fecha: '2024-11-20' },
      { id: '2', case_id: '3', descripcion: 'Registro Público', cantidad: 1, importe: 1500, total: 1500, fecha: '2024-11-22' },
    ],
    invoices: [],
  },
  {
    id: '4', n_tarea: 3, numero_caso: '0000003', client_id: '3', society_id: '3', service_id: '3',
    service_item_id: 'si3', descripcion: 'Certificado de Existencia', estado: 'Completado/Facturado',
    etapa_id: 'e8', gastos_cotizados: 2000, cliente_temporal: false, prioridad_urgente: false, prioridad: 'Media',
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón', usuario_asignado_id: 'u4',
    observaciones: 'CRP y poder firmado por MIP', fecha_caso: '2024-11-10', created_at: '2024-11-10',
    comments: [
      { id: '4', case_id: '4', user_name: 'Yolimar Gordón', comentario: 'Certificado emitido.', created_at: '2024-11-12T11:00:00' },
    ],
    expenses: [],
    invoices: [],
  },
  {
    id: '5', n_tarea: 2, numero_caso: '0000002', client_id: '4', society_id: '4', service_id: '3',
    service_item_id: 'si3', descripcion: 'Certificado de Existencia', estado: 'Completado/Facturado',
    etapa_id: 'e8', gastos_cotizados: 2500, cliente_temporal: false, prioridad_urgente: false, prioridad: 'Baja',
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón', usuario_asignado_id: 'u4',
    observaciones: 'MIP Gestionar CRP', fecha_caso: '2024-10-28', created_at: '2024-10-28',
    comments: [
      { id: '5', case_id: '5', user_name: 'Yolimar Gordón', comentario: 'Pendiente firma del cliente.', created_at: '2024-10-30T10:00:00' },
      { id: '6', case_id: '5', user_name: 'María Isabel Palma', comentario: 'Firmado y entregado.', created_at: '2024-11-02T16:00:00' },
    ],
    expenses: [
      { id: '3', case_id: '5', descripcion: 'Gestión RP', cantidad: 1, importe: 800, total: 800, fecha: '2024-10-30' },
    ],
    invoices: [],
  },
  {
    id: '6', n_tarea: 1, numero_caso: '0000001', client_id: '5', society_id: undefined, service_id: '4',
    service_item_id: 'si3', descripcion: 'Apostilla de Documento', estado: 'En Curso',
    etapa_id: 'e7', gastos_cotizados: 1500, cliente_temporal: true, prioridad_urgente: true, prioridad: 'Urgente',
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma', usuario_asignado_id: 'u6',
    observaciones: '', fecha_caso: '2024-10-15', fecha_vencimiento: '2024-11-15',
    recurrencia: false, envio_correo: true, created_at: '2024-10-15',
    comments: [
      { id: '7', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'Documento recibido para apostilla.', created_at: '2024-10-15T09:00:00' },
      { id: '8', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'En proceso de apostilla en el MRE.', created_at: '2024-10-18T11:00:00' },
    ],
    expenses: [
      { id: '4', case_id: '6', descripcion: 'Tasa apostilla MRE', cantidad: 1, importe: 300, total: 300, fecha: '2024-10-16' },
      { id: '5', case_id: '6', descripcion: 'Mensajería', cantidad: 2, importe: 50, total: 100, fecha: '2024-10-17' },
    ],
    invoices: [],
  },
];
