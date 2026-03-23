export interface Client {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  identificacion: string;
  direccion: string;
  quickbooks_customer_id?: string;
  activo: boolean;
  observaciones?: string;
  created_at: string;
}

export interface Society {
  id: string;
  client_id: string;
  nombre: string;
  tipo_sociedad: string;
  correo: string;
  telefono: string;
  identificacion_fiscal?: string;
  quickbooks_customer_id?: string;
  activo: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  codigo?: string;
  tarifa_base?: number;
  activo: boolean;
}

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
}

export interface QBItem {
  id: string;
  nombre_interno: string;
  nombre_qb: string;
  qb_item_id?: string;
  tipo: string;
  impuesto_default?: number;
  activo: boolean;
}

export interface CaseInvoice {
  id: string;
  case_id: string;
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
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  servicio_id?: string;
  qb_item_id?: string;
  descripcion: string;
  cantidad: number;
  tarifa: number;
  importe: number;
  itbms: number;
}

export interface Case {
  id: string;
  numero_caso: string;
  client_id?: string;
  society_id?: string;
  service_id: string;
  descripcion: string;
  estado: 'Pendiente' | 'Completado/Facturado' | 'En Proceso' | 'Cancelado';
  etapa: string;
  gastos_cotizados: number;
  cliente_temporal: boolean;
  prioridad_urgente: boolean;
  creado_por: string;
  responsable: string;
  observaciones: string;
  fecha_caso: string;
  created_at: string;
  comments: CaseComment[];
  expenses: CaseExpense[];
  invoices: CaseInvoice[];
}

export const mockClients: Client[] = [
  { id: '1', nombre: 'SAUL SASSON', email: 'saul@email.com', telefono: '+507 6000-1111', identificacion: 'PE-1234', direccion: 'Panamá City', activo: true, created_at: '2024-01-10' },
  { id: '2', nombre: 'ANA MARIA GOMEZ', email: 'ana@email.com', telefono: '+507 6000-2222', identificacion: 'PE-5678', direccion: 'Costa del Este', activo: true, created_at: '2024-01-15' },
  { id: '3', nombre: 'JOSE FERNANDO CADAVID', email: 'jose@email.com', telefono: '+507 6000-3333', identificacion: 'PE-9012', direccion: 'Punta Pacífica', activo: true, created_at: '2024-02-01' },
  { id: '4', nombre: 'SUSANA BERENGUER', email: 'susana@email.com', telefono: '+507 6000-4444', identificacion: 'PE-3456', direccion: 'El Cangrejo', activo: true, created_at: '2024-02-10' },
  { id: '5', nombre: 'JEAN RICHA HOLMES', email: 'jean@email.com', telefono: '+507 6000-5555', identificacion: 'PE-7890', direccion: 'San Francisco', activo: true, created_at: '2024-03-01' },
];

export const mockSocieties: Society[] = [
  { id: '1', client_id: '1', nombre: 'HASANI S.A.', tipo_sociedad: 'S.A.', correo: 'hasani@corp.com', telefono: '+507 300-1111', activo: true, created_at: '2024-01-12' },
  { id: '2', client_id: '2', nombre: 'ANA MARIA GOMEZ', tipo_sociedad: 'Personal', correo: 'ana@corp.com', telefono: '+507 300-2222', activo: true, created_at: '2024-01-16' },
  { id: '3', client_id: '3', nombre: 'ABASA GROUP CORP.', tipo_sociedad: 'Corp.', correo: 'abasa@corp.com', telefono: '+507 300-3333', activo: true, created_at: '2024-02-05' },
  { id: '4', client_id: '4', nombre: 'FBBC CORPORATION', tipo_sociedad: 'Corp.', correo: 'fbbc@corp.com', telefono: '+507 300-4444', activo: true, created_at: '2024-02-15' },
  { id: '5', client_id: '3', nombre: 'DOVLE CINCUENTENARIO 5B-200, S.A.', tipo_sociedad: 'S.A.', correo: 'dovle@corp.com', telefono: '+507 300-5555', activo: true, created_at: '2024-03-01' },
];

export const mockServices: Service[] = [
  { id: '1', nombre: 'Constitución Sociedad Anónima', categoria: 'Corporativo', descripcion: 'Constitución de S.A.', activo: true },
  { id: '2', nombre: 'Emisión de Poder General o Especial', categoria: 'Corporativo', descripcion: 'Emisión de poderes', activo: true },
  { id: '3', nombre: 'Certificado de Existencia', categoria: 'Corporativo', descripcion: 'Certificado de existencia otros servicios corporativos', activo: true },
  { id: '4', nombre: 'Apostilla de Documento', categoria: 'Legal', descripcion: 'Apostilla otros servicios corporativos', activo: true },
];

export const mockInvoiceTerms: InvoiceTerm[] = [
  { id: '1', nombre: 'Pago Inmediato', dias_vencimiento: 0, activo: true },
  { id: '2', nombre: 'Net 15', dias_vencimiento: 15, activo: true },
  { id: '3', nombre: 'Net 30', dias_vencimiento: 30, activo: true },
];

export const mockQBItems: QBItem[] = [
  { id: '1', nombre_interno: 'Constitución S.A.', nombre_qb: 'Corp Formation SA', qb_item_id: 'QB-001', tipo: 'Servicio', impuesto_default: 7, activo: true },
  { id: '2', nombre_interno: 'Poder General', nombre_qb: 'Power of Attorney', qb_item_id: 'QB-002', tipo: 'Servicio', impuesto_default: 7, activo: true },
  { id: '3', nombre_interno: 'Certificado Existencia', nombre_qb: 'Good Standing Certificate', qb_item_id: 'QB-003', tipo: 'Servicio', impuesto_default: 7, activo: true },
];

export const mockCases: Case[] = [
  {
    id: '1', numero_caso: '00006', client_id: '1', society_id: '1', service_id: '1',
    descripcion: 'Constitución Sociedad Anónima', estado: 'Pendiente', etapa: 'Cotización',
    gastos_cotizados: 5000, cliente_temporal: false, prioridad_urgente: false,
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma',
    observaciones: 'SOCIEDAD NUEVA', fecha_caso: '2024-12-01', created_at: '2024-12-01',
    comments: [
      { id: '1', case_id: '1', user_name: 'Yolimar Gordón', comentario: 'Caso creado, pendiente de documentos del cliente.', created_at: '2024-12-01T10:00:00' },
    ],
    expenses: [],
    invoices: [],
  },
  {
    id: '2', numero_caso: '00005', client_id: '2', society_id: '2', service_id: '2',
    descripcion: 'Emisión de Poder General o Especial - No Inscrito OTROS SERVICIOS CORPORATIVOS', estado: 'Pendiente', etapa: 'En Proceso',
    gastos_cotizados: 3000, cliente_temporal: false, prioridad_urgente: false,
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma',
    observaciones: '', fecha_caso: '2024-11-20', created_at: '2024-11-20',
    comments: [],
    expenses: [],
    invoices: [],
  },
  {
    id: '3', numero_caso: '00004', client_id: '3', society_id: '5', service_id: '1',
    descripcion: 'Constitución Sociedad Anónima', estado: 'Completado/Facturado', etapa: 'Completado',
    gastos_cotizados: 4500, cliente_temporal: false, prioridad_urgente: false,
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón',
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
    id: '4', numero_caso: '00003', client_id: '3', society_id: '3', service_id: '3',
    descripcion: 'Certificado de Existencia OTROS SERVICIOS CORPORATIVOS', estado: 'Completado/Facturado', etapa: 'Facturado',
    gastos_cotizados: 2000, cliente_temporal: false, prioridad_urgente: false,
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón',
    observaciones: 'CRP y poder firmado por MIP', fecha_caso: '2024-11-10', created_at: '2024-11-10',
    comments: [
      { id: '4', case_id: '4', user_name: 'Yolimar Gordón', comentario: 'Certificado emitido.', created_at: '2024-11-12T11:00:00' },
    ],
    expenses: [],
    invoices: [],
  },
  {
    id: '5', numero_caso: '00002', client_id: '4', society_id: '4', service_id: '3',
    descripcion: 'Certificado de Existencia OTROS SERVICIOS CORPORATIVOS', estado: 'Completado/Facturado', etapa: 'Facturado',
    gastos_cotizados: 2500, cliente_temporal: false, prioridad_urgente: false,
    creado_por: 'Yolimar Gordón', responsable: 'Yolimar Gordón',
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
    id: '6', numero_caso: '00001', client_id: '5', society_id: undefined, service_id: '4',
    descripcion: 'Apostilla de Documento OTROS SERVICIOS CORPORATIVOS', estado: 'Pendiente', etapa: 'En Proceso',
    gastos_cotizados: 1500, cliente_temporal: true, prioridad_urgente: true,
    creado_por: 'Yolimar Gordón', responsable: 'María Isabel Palma',
    observaciones: '', fecha_caso: '2024-10-15', created_at: '2024-10-15',
    comments: [
      { id: '7', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'Documento recibido para apostilla.', created_at: '2024-10-15T09:00:00' },
      { id: '8', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'En proceso de apostilla en el MRE.', created_at: '2024-10-18T11:00:00' },
      { id: '9', case_id: '6', user_name: 'María Isabel Palma', comentario: 'Seguimiento realizado, esperando respuesta.', created_at: '2024-10-22T14:00:00' },
      { id: '10', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'Apostilla lista, pendiente de entrega.', created_at: '2024-10-25T10:00:00' },
      { id: '11', case_id: '6', user_name: 'María Isabel Palma', comentario: 'Cliente notificado para recoger.', created_at: '2024-10-28T09:30:00' },
      { id: '12', case_id: '6', user_name: 'Yolimar Gordón', comentario: 'Entregado al cliente.', created_at: '2024-10-30T16:00:00' },
    ],
    expenses: [
      { id: '4', case_id: '6', descripcion: 'Tasa apostilla MRE', cantidad: 1, importe: 300, total: 300, fecha: '2024-10-16' },
      { id: '5', case_id: '6', descripcion: 'Mensajería', cantidad: 2, importe: 50, total: 100, fecha: '2024-10-17' },
    ],
    invoices: [],
  },
];
