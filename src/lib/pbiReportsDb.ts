import { getSupabase } from '@/lib/supabaseClient';

export type PBIReportRow = {
  id: string;
  area: string;
  title: string;
  embed_url: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
};

export const PBI_AREA_LABELS: Record<string, string> = {
  contabilidad: 'Contabilidad',
  legal:        'Legal',
  cumplimiento: 'Cumplimiento',
  financiero:   'Financiero',
};

export async function fetchPBIReports(): Promise<PBIReportRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pbi_reports')
    .select('*')
    .eq('active', true)
    .order('area')
    .order('sort_order')
    .order('created_at');
  if (error) { console.error('[pbi_reports] fetch:', error.message); return []; }
  return (data ?? []) as PBIReportRow[];
}

export async function fetchAllPBIReports(): Promise<PBIReportRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pbi_reports')
    .select('*')
    .order('area')
    .order('sort_order')
    .order('created_at');
  if (error) { console.error('[pbi_reports] fetchAll:', error.message); return []; }
  return (data ?? []) as PBIReportRow[];
}

export async function savePBIReport(
  report: Omit<PBIReportRow, 'id' | 'created_at'> & { id?: string },
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = report.id
    ? await sb.from('pbi_reports').update({ area: report.area, title: report.title, embed_url: report.embed_url, description: report.description, sort_order: report.sort_order, active: report.active }).eq('id', report.id)
    : await sb.from('pbi_reports').insert({ area: report.area, title: report.title, embed_url: report.embed_url, description: report.description ?? null, sort_order: report.sort_order, active: report.active });
  if (error) { console.error('[pbi_reports] save:', error.message); return false; }
  return true;
}

export async function deletePBIReport(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from('pbi_reports').delete().eq('id', id);
  if (error) { console.error('[pbi_reports] delete:', error.message); return false; }
  return true;
}
