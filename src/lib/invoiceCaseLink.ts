import { Case, CaseInvoice } from '@/data/mockData';

/**
 * Localiza el caso de negocio asociado a una factura cuando `case_id` viene vacío
 * pero cliente/sociedad coinciden con un único caso (o el más plausible).
 */
export function findCaseForInvoice(
  inv: Pick<CaseInvoice, 'case_id' | 'client_id' | 'society_id'>,
  cases: Case[]
): Case | undefined {
  if (inv.case_id) {
    const byId = cases.find(c => c.id === inv.case_id);
    if (byId) return byId;
  }
  if (!inv.client_id) return undefined;
  const sameClient = cases.filter(c => c.client_id === inv.client_id);
  if (inv.society_id) {
    const withSoc = sameClient.filter(c => c.society_id === inv.society_id);
    if (withSoc.length === 1) return withSoc[0];
    if (withSoc.length > 1) return withSoc[0];
  } else {
    const noSoc = sameClient.filter(c => !c.society_id);
    if (noSoc.length === 1) return noSoc[0];
  }
  if (sameClient.length === 1) return sameClient[0];
  return undefined;
}
