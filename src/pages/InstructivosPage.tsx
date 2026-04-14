import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search, PlayCircle, Clock, LogIn, LayoutDashboard, Briefcase, Users,
  UserCog, Building2, Receipt, BarChart3, GitCompare, Shield, Settings,
  ChevronRight, BookOpen, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ================================================================== */
/*  Datos de instructivos                                              */
/* ================================================================== */

type Instructivo = {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  duracion: string;
  icon: React.ReactNode;
  videoUrl?: string;        // URL de YouTube/Loom cuando se grabe
  guion: string[];          // Pasos del guion
};

const CATEGORIAS = [
  { key: 'general', label: 'General', color: 'bg-slate-500' },
  { key: 'casos', label: 'Casos y Facturacion', color: 'bg-orange-500' },
  { key: 'mantenimiento', label: 'Mantenimiento', color: 'bg-blue-500' },
  { key: 'reportes', label: 'Reportes y Analisis', color: 'bg-emerald-500' },
  { key: 'integraciones', label: 'Integraciones', color: 'bg-purple-500' },
];

const INSTRUCTIVOS: Instructivo[] = [
  {
    id: 'login',
    numero: 1,
    titulo: 'INICIO DE SESION - PLATAFORMA ANCORI',
    descripcion: 'Como acceder a la plataforma, iniciar sesion con tu correo y contrasena, y navegar por primera vez.',
    categoria: 'general',
    duracion: '2 min',
    icon: <LogIn className="h-5 w-5" />,
    guion: [
      'Abrir el navegador y acceder a la URL de la Plataforma Ancori',
      'En la pantalla de login, ingresar el correo electronico asignado',
      'Ingresar la contrasena proporcionada por el administrador',
      'Hacer clic en "Iniciar sesion"',
      'Al entrar, se muestra el Dashboard con el resumen de casos',
      'En la parte inferior del menu lateral aparece tu nombre y rol',
      'Para cerrar sesion, hacer clic en el icono de salida junto a tu nombre',
    ],
  },
  {
    id: 'dashboard',
    numero: 2,
    titulo: 'DASHBOARD - VISTA GENERAL Y FILTROS',
    descripcion: 'Conoce el dashboard principal con KPIs, filtros por ano/mes/estado/proceso/cliente, tabla de casos y graficos interactivos.',
    categoria: 'general',
    duracion: '3 min',
    icon: <LayoutDashboard className="h-5 w-5" />,
    guion: [
      'Al iniciar sesion, la primera pantalla es el Dashboard',
      'En la parte superior se muestran 4 KPI cards: Total Casos, Pendientes, Completados y Urgentes',
      'Debajo hay una barra de filtros con 5 dropdowns: Ano, Mes, Estado, Proceso y Cliente',
      'Seleccionar un filtro actualiza automaticamente los KPIs, la tabla y los graficos',
      'La tabla central muestra 9 columnas: # Caso, Descripcion, Proceso, Estado, Prioridad, Usuario Asignado, Fecha Ingreso, Fecha Seguimiento y Dias de Vencimiento',
      'Los dias de vencimiento se colorean: rojo (vencido), amarillo (proximo) y verde (a tiempo)',
      'Se puede ordenar por cualquier columna haciendo clic en el encabezado',
      'El boton "Exportar Excel" descarga la tabla filtrada en formato CSV',
      'En la parte inferior hay dos graficos: Donut de estados y Barras de procesos',
      'El boton "Limpiar" elimina todos los filtros aplicados',
    ],
  },
  {
    id: 'casos',
    numero: 3,
    titulo: 'CREAR Y GESTIONAR CASOS',
    descripcion: 'Como crear un nuevo caso, asignar cliente/sociedad/servicio, cambiar estado, agregar comentarios, gastos y facturas.',
    categoria: 'casos',
    duracion: '5 min',
    icon: <Briefcase className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Casos" en el menu lateral',
      'Se muestra la tabla de seguimiento de casos con filtros rapidos de Estado y Prioridad',
      'Para crear un caso nuevo, hacer clic en "+ Nuevo Caso"',
      'Llenar los campos: Cliente, Sociedad, Servicio, Descripcion, Prioridad',
      'Asignar un usuario responsable y establecer fecha de seguimiento',
      'Guardar el caso — se genera automaticamente un numero correlativo',
      'Para editar un caso, hacer clic sobre la fila en la tabla',
      'En el modal de edicion se pueden cambiar todos los campos incluyendo el estado',
      'Estados disponibles: Pendiente, En Curso, Completado/Facturado, Cancelado',
      'El icono de comentarios permite agregar notas al caso',
      'El icono de gastos ($) permite registrar gastos asociados al caso',
      'El icono de factura permite crear facturas vinculadas al caso',
      'Para eliminar un caso, usar el icono de papelera (requiere confirmacion)',
    ],
  },
  {
    id: 'clientes',
    numero: 4,
    titulo: 'MANTENIMIENTO DE CLIENTES',
    descripcion: 'Crear, editar y gestionar el catalogo de clientes. Campos de nombre, razon social, correo, telefono y tipo de cliente.',
    categoria: 'mantenimiento',
    duracion: '3 min',
    icon: <Users className="h-5 w-5" />,
    guion: [
      'Ir a Mantenimiento > Clientes en el menu lateral',
      'Se muestra la lista de todos los clientes con su numero correlativo',
      'Para crear un cliente nuevo, hacer clic en "+ Nuevo Cliente"',
      'Llenar: Nombre (obligatorio), Razon Social, Correo, Telefono',
      'Marcar si el cliente esta Activo o Inactivo con el toggle',
      'En la seccion avanzada se puede agregar Identificacion y QB Customer ID',
      'Para editar, hacer clic sobre el cliente en la tabla',
      'Para eliminar, usar el icono de papelera (solo si no tiene casos vinculados)',
      'Se puede buscar clientes por nombre usando el campo de busqueda superior',
    ],
  },
  {
    id: 'directores',
    numero: 5,
    titulo: 'MANTENIMIENTO DE DIRECTORES',
    descripcion: 'Gestionar el catalogo de directores con tipo de documento, fecha de vencimiento y estado activo.',
    categoria: 'mantenimiento',
    duracion: '3 min',
    icon: <UserCog className="h-5 w-5" />,
    guion: [
      'Ir a Mantenimiento > Directores en el menu lateral',
      'Se muestra la lista de directores con busqueda y filtros',
      'Para crear un director nuevo, hacer clic en "+ Nuevo Director"',
      'Llenar: Nombre (obligatorio), Tipo de Documento (Cedula/Pasaporte/Otro)',
      'Establecer la Fecha de Vencimiento del documento',
      'Agregar comentarios u observaciones relevantes',
      'Los directores se asignan a sociedades como Presidente, Tesorero o Secretario',
      'Revisar periodicamente las fechas de vencimiento de documentos',
    ],
  },
  {
    id: 'sociedades',
    numero: 6,
    titulo: 'MANTENIMIENTO DE SOCIEDADES',
    descripcion: 'Crear sociedades vinculadas a clientes, asignar directores, RUC/DV/NIT, y sincronizar con QuickBooks.',
    categoria: 'mantenimiento',
    duracion: '4 min',
    icon: <Building2 className="h-5 w-5" />,
    guion: [
      'Ir a Mantenimiento > Sociedades en el menu lateral',
      'Se muestra la tabla de sociedades con todos los campos',
      'Para crear una sociedad, hacer clic en "+ Nueva Sociedad"',
      'Seleccionar el Cliente al que pertenece la sociedad',
      'Llenar: Nombre, Razon Social, Tipo (SOCIEDADES/FUNDACIONES/B.V.I)',
      'Ingresar datos fiscales: RUC, DV, NIT',
      'Asignar directores: Presidente, Tesorero, Secretario (del catalogo de directores)',
      'Establecer fecha de inscripcion y pago de tasa unica si aplica',
      'Al guardar, si QuickBooks esta conectado, la sociedad se sincroniza automaticamente',
      'Los filtros permiten buscar por tipo de sociedad, cliente o semestre',
      'El campo ID QB muestra el identificador en QuickBooks',
    ],
  },
  {
    id: 'facturas',
    numero: 7,
    titulo: 'MODULO DE FACTURAS - CREAR Y ENVIAR A QUICKBOOKS',
    descripcion: 'Crear facturas con lineas de detalle, calcular ITBMS, y enviar directamente a QuickBooks Online.',
    categoria: 'casos',
    duracion: '5 min',
    icon: <Receipt className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Facturas" en el menu lateral',
      'Se muestra la tabla de facturas con estado, sociedad, monto y fecha',
      'Las facturas pueden crearse desde un caso o directamente',
      'Al crear una factura, seleccionar la Sociedad y el Termino de Factura',
      'Agregar lineas de detalle: Servicio, Descripcion, Cantidad, Tarifa',
      'El ITBMS se calcula automaticamente segun el porcentaje configurado',
      'Los estados de factura son: Borrador, Pendiente, Enviada, Error, Anulada',
      'Para enviar a QuickBooks, hacer clic en "Enviar a QB" en la fila de la factura',
      'La factura se crea en QuickBooks con el cliente/sociedad vinculado',
      'El numero de factura QB se muestra en la columna correspondiente',
      'Se pueden filtrar facturas por estado: Pendientes vs Todas',
    ],
  },
  {
    id: 'reportes',
    numero: 8,
    titulo: 'REPORTES - ANALISIS OPERATIVO Y FINANCIERO',
    descripcion: 'Usar los 4 tabs de reportes: Operativo, Por Usuario, Por Cliente y Financiero, con graficos y exportacion.',
    categoria: 'reportes',
    duracion: '4 min',
    icon: <BarChart3 className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Reportes" en el menu lateral',
      'En la parte superior hay filtros compartidos: Ano, Mes, Estado, Proceso, Cliente',
      'Los filtros aplican a todos los tabs simultaneamente',
      'TAB OPERATIVO: Muestra 6 KPIs, donut de estados, barras de procesos, barras de prioridad y tendencia mensual',
      'Debajo hay una tabla detalle con las 9 columnas del caso y exportacion a Excel',
      'TAB POR USUARIO: Grafico de barras apiladas con carga de trabajo por usuario',
      'Tabla con desglose de pendientes, en curso, completados y urgentes por usuario',
      'TAB POR CLIENTE: Grafico de barras con casos por cliente',
      'Tabla con total de casos, pendientes, completados y numero de sociedades',
      'TAB FINANCIERO: 4 KPIs monetarios (Total Facturado, Pendiente, Enviado QB, ITBMS)',
      'Grafico de facturacion mensual y donut de facturas por estado',
      'Tabla detalle de facturas con subtotal, impuesto, total y estado',
      'Cada tabla tiene boton "Exportar Excel" que descarga los datos filtrados en CSV',
    ],
  },
  {
    id: 'conciliacion',
    numero: 9,
    titulo: 'CONCILIACION - RESOLVER DIFERENCIAS CON QUICKBOOKS',
    descripcion: 'Como usar la seccion de Conciliacion para resolver conflictos de datos entre Ancori y QuickBooks.',
    categoria: 'integraciones',
    duracion: '3 min',
    icon: <GitCompare className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Conciliacion" en el menu lateral',
      'Esta seccion detecta automaticamente diferencias entre Ancori y QuickBooks',
      'El badge rojo en el menu indica cuantos conflictos hay pendientes',
      'La tabla muestra: Sociedad, Campo, Valor Ancori, Valor QuickBooks',
      'Para cada conflicto hay 3 opciones:',
      '  - "Ancori": el valor de la plataforma se envia a QuickBooks',
      '  - "QB": el valor de QuickBooks se escribe en Ancori',
      '  - "Descartar": ignora el conflicto (puede reaparecer en proxima sync)',
      'Solo los roles autorizados (Abogada, Contabilidad, Socio) pueden resolver conflictos',
      'Antes de resolver, se muestra un dialogo de confirmacion',
      'Los conflictos resueltos desaparecen de la tabla automaticamente',
    ],
  },
  {
    id: 'cumplimiento',
    numero: 10,
    titulo: 'CUMPLIMIENTO - VERIFICACION PEP/AML CON AGILECHECK',
    descripcion: 'Como usar el modulo de cumplimiento para verificar clientes y directores contra listas PEP y sanciones internacionales.',
    categoria: 'integraciones',
    duracion: '3 min',
    icon: <Shield className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Cumplimiento" en el menu lateral (icono de escudo)',
      'Se muestran 6 KPIs: Total Verificados, Limpios, Coincidencia PEP, En Revision, Pendientes, Expirados',
      'Las alertas rojas indican coincidencias con listas PEP que requieren revision',
      'Las alertas amarillas muestran clientes y directores sin verificar',
      'El grafico donut muestra la proporcion de estados de verificacion',
      'El grafico de barras muestra cobertura por tipo de entidad (Clientes, Directores, Sociedades)',
      'Los filtros permiten buscar por tipo de entidad, estado y nivel de riesgo',
      'Para verificar una entidad, hacer clic en el boton de verificacion',
      'Se confirma la consulta a AgileCheck en el dialogo',
      'El resultado muestra: Limpio (verde), Coincidencia (rojo), En Revision (amarillo)',
      'Las verificaciones expiran a los 6 meses — se marca con el icono de alerta',
      'Solo roles autorizados (Cumplimiento, Socio, Abogada) pueden ejecutar verificaciones',
      'La tabla se puede exportar a Excel con todos los resultados',
    ],
  },
  {
    id: 'configuracion',
    numero: 11,
    titulo: 'CONFIGURACION - INTEGRACION CON QUICKBOOKS ONLINE',
    descripcion: 'Como conectar QuickBooks Online con la plataforma, verificar el estado de conexion y sincronizar datos.',
    categoria: 'integraciones',
    duracion: '3 min',
    icon: <Settings className="h-5 w-5" />,
    guion: [
      'Ir a la seccion "Configuracion" en el menu lateral',
      'Se muestra el estado de conexion con QuickBooks: "Conectado" (verde) o "No conectado" (gris)',
      'Si esta conectado, se muestra el Realm ID y la fecha de expiracion del token',
      'Para conectar QuickBooks, hacer clic en "Conectar QuickBooks"',
      'Se abre la pagina de autorizacion de Intuit (QuickBooks)',
      'Iniciar sesion con las credenciales de QuickBooks y autorizar el acceso',
      'Al regresar a la plataforma, el estado cambia a "Conectado"',
      'La conexion se renueva automaticamente cada hora via GitHub Actions',
      'Si el token expira, hacer clic en "Conectar QuickBooks" nuevamente',
    ],
  },
];

/* ================================================================== */
/*  Componente                                                         */
/* ================================================================== */

export default function InstructivosPage() {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = INSTRUCTIVOS.filter(inst => {
    if (filterCat && inst.categoria !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      const blob = `${inst.titulo} ${inst.descripcion} ${inst.guion.join(' ')}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-orange-500" />
          Instructivos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Guias paso a paso para usar cada seccion de la Plataforma Ancori
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Video className="h-4 w-4" />
          {INSTRUCTIVOS.length} videos
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          ~38 minutos en total
        </span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar instructivo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat('')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              !filterCat ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            Todos
          </button>
          {CATEGORIAS.map(cat => (
            <button
              key={cat.key}
              onClick={() => setFilterCat(cat.key === filterCat ? '' : cat.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filterCat === cat.key ? `${cat.color} text-white` : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de instructivos */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No se encontraron instructivos</p>
          </div>
        ) : filtered.map(inst => {
          const cat = CATEGORIAS.find(c => c.key === inst.categoria);
          const isExpanded = expandedId === inst.id;

          return (
            <Card
              key={inst.id}
              className={cn(
                'shadow-sm transition-all cursor-pointer hover:shadow-md',
                isExpanded && 'ring-2 ring-orange-200',
              )}
              onClick={() => setExpandedId(isExpanded ? null : inst.id)}
            >
              <CardContent className="p-0">
                {/* Header del instructivo */}
                <div className="flex items-center gap-4 p-4">
                  {/* Numero */}
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm">
                    {inst.numero}
                  </div>

                  {/* Icono + Titulo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-orange-500">{inst.icon}</span>
                      <h3 className="font-semibold text-sm tracking-wide truncate">
                        {inst.titulo}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {inst.descripcion}
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {cat?.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {inst.duracion}
                    </span>
                    {inst.videoUrl ? (
                      <PlayCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <PlayCircle className="h-5 w-5 text-muted-foreground/30" />
                    )}
                    <ChevronRight className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-90',
                    )} />
                  </div>
                </div>

                {/* Contenido expandido */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 bg-muted/20">
                    {/* Video embed (cuando exista) */}
                    {inst.videoUrl ? (
                      <div className="mb-4 rounded-lg overflow-hidden bg-black aspect-video">
                        <iframe
                          src={inst.videoUrl}
                          className="w-full h-full"
                          allowFullScreen
                          title={inst.titulo}
                        />
                      </div>
                    ) : (
                      <div className="mb-4 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 border-2 border-dashed border-slate-200 aspect-video flex items-center justify-center">
                        <div className="text-center">
                          <PlayCircle className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400 font-medium">Video en preparacion</p>
                          <p className="text-xs text-slate-300 mt-1">Proximamente</p>
                        </div>
                      </div>
                    )}

                    {/* Guion / Pasos */}
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Pasos del instructivo
                    </h4>
                    <ol className="space-y-1.5">
                      {inst.guion.map((paso, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="flex-shrink-0 h-5 w-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-muted-foreground">{paso}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
