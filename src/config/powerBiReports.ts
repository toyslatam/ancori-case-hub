export type PBIReport = {
  id: string;
  title: string;
  embedUrl: string;
  description?: string;
};

export type PBIArea = {
  id: string;
  label: string;
  reports: PBIReport[];
};

/**
 * Configuración de reportes Power BI por área.
 * Para agregar un reporte:
 *  1. En Power BI Service → abre el reporte → Archivo → Publicar en web
 *  2. Copia la URL del <iframe src="..."> que genera
 *  3. Pégala en embedUrl del área correspondiente
 */
export const PBI_AREAS: PBIArea[] = [
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    reports: [
      // Pega aquí la URL del iframe que genera Power BI al publicar en web:
      // { id: 'cont-1', title: 'Nombre del reporte', embedUrl: 'PEGA_AQUI_LA_URL' },
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    reports: [
      // { id: 'leg-1', title: 'Estado de Contratos', embedUrl: 'https://app.powerbi.com/reportEmbed?reportId=...' },
    ],
  },
  {
    id: 'cumplimiento',
    label: 'Cumplimiento',
    reports: [
      // { id: 'cum-1', title: 'Dashboard de Compliance', embedUrl: 'https://app.powerbi.com/reportEmbed?reportId=...' },
    ],
  },
  {
    id: 'financiero',
    label: 'Financiero',
    reports: [
      // { id: 'fin-1', title: 'Flujo de Caja', embedUrl: 'https://app.powerbi.com/reportEmbed?reportId=...' },
    ],
  },
];
