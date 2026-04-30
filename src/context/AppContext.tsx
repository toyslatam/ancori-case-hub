import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Case, Category, Client, Director, Etapa, Society, SocietyService, SocietyServiceLink, Service, ServiceItem, Usuario, InvoiceTerm, QBItem,
  mockCases, mockCategories, mockClients, mockDirectores, mockEtapas, mockSocieties, mockSocietyServiceLinks, mockSocietyServices, mockServices, mockServiceItems, mockUsuarios, mockInvoiceTerms, mockQBItems,
  CaseComment, CaseExpense, CaseInvoice,
} from '@/data/mockData';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import {
  isQboSocietyPushConfigured,
  pushSocietyToQuickbooksDelete,
  pushSocietyToQuickbooksUpsert,
} from '@/lib/qboIntegration';
import * as db from '@/lib/supabaseDb';
import { getSupabaseConfig } from '@/lib/supabaseClient';

interface AppContextType {
  cases: Case[];
  allInvoices: CaseInvoice[];
  clients: Client[];
  societies: Society[];
  societyServices: SocietyService[];
  societyServiceLinks: SocietyServiceLink[];
  services: Service[];
  serviceItems: ServiceItem[];
  etapas: Etapa[];
  usuarios: Usuario[];
  invoiceTerms: InvoiceTerm[];
  categories: Category[];
  qbItems: QBItem[];
  directores: Director[];
  addCase: (c: Case) => void;
  updateCase: (c: Case) => void;
  addComment: (caseId: string, comment: CaseComment) => void;
  addExpense: (caseId: string, expense: CaseExpense) => void;
  updateExpenses: (caseId: string, expenses: CaseExpense[]) => void;
  saveInvoice: (caseId: string, invoice: CaseInvoice, isEdit: boolean) => Promise<boolean>;
  /** Actualiza una factura en `allInvoices` y en el caso anidado (p. ej. tras enviar a QB). */
  patchInvoice: (invoiceId: string, patch: Partial<CaseInvoice>) => void;
  deleteInvoice: (caseId: string, invoiceId: string) => Promise<boolean>;
  removeCase: (id: string) => Promise<boolean>;
  saveClient: (client: Client, isEdit: boolean) => Promise<boolean>;
  deleteClient: (id: string) => Promise<boolean>;
  saveSociety: (society: Society, isEdit: boolean) => Promise<boolean>;
  deleteSociety: (id: string) => Promise<boolean>;
  saveSocietyService: (service: SocietyService, isEdit: boolean) => Promise<boolean>;
  syncSocietyServices: (societyId: string, serviceIds: string[]) => Promise<boolean>;
  saveService: (service: Service, isEdit: boolean) => Promise<boolean>;
  deleteService: (id: string) => Promise<boolean>;
  saveServiceItem: (item: ServiceItem, isEdit: boolean) => Promise<boolean>;
  deleteServiceItem: (id: string) => Promise<boolean>;
  saveEtapa: (e: Etapa, isEdit: boolean) => Promise<boolean>;
  deleteEtapa: (id: string) => Promise<boolean>;
  saveUsuario: (u: Usuario, isEdit: boolean) => Promise<boolean>;
  deleteUsuario: (id: string) => Promise<boolean>;
  saveInvoiceTerm: (term: InvoiceTerm, isEdit: boolean) => Promise<boolean>;
  deleteInvoiceTerm: (id: string) => Promise<boolean>;
  saveCategory: (c: Category, isEdit: boolean) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  saveQBItem: (item: QBItem, isEdit: boolean) => Promise<boolean>;
  deleteQBItem: (id: string) => Promise<boolean>;
  saveDirector: (d: Director, isEdit: boolean) => Promise<boolean>;
  deleteDirector: (id: string) => Promise<boolean>;
  getClientName: (id?: string) => string;
  getSocietyName: (id?: string) => string;
  getSocietyServiceIds: (societyId?: string) => string[];
  getSocietyServiceNames: (societyId?: string) => string[];
  getServiceName: (id?: string) => string;
  getServiceItemName: (id?: string) => string;
  getEtapaName: (id?: string) => string;
  getUsuarioName: (id?: string) => string;
  getDirectorName: (id?: string) => string;
  /** Recarga solo `clients` desde Supabase y actualiza estado + cache. */
  refreshClients: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let tid: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    tid = window.setTimeout(() => reject(new Error(`Timeout (${timeoutMs} ms): ${label}`)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (tid != null) window.clearTimeout(tid);
  }) as Promise<T>;
}

function isTimeoutError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Timeout\s*\(\d+\s*ms\)/i.test(msg);
}

const CLIENT_MUTATION_TIMEOUT_MS = 30_000;
const CLIENT_VERIFY_TIMEOUT_MS = 10_000;

function isAbortLikeError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /abort|aborted|timeout/i.test(msg);
}

async function withAbortableClientRequest<T>(
  label: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const tid = window.setTimeout(() => {
    controller.abort();
    console.warn(`[clients] ${label} abortado después de ${timeoutMs}ms`);
  }, timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    window.clearTimeout(tid);
  }
}

function clientFieldsMatch(expected: Client, actual: Client): boolean {
  return (
    expected.nombre === actual.nombre &&
    expected.razon_social === actual.razon_social &&
    (expected.email ?? '') === (actual.email ?? '') &&
    (expected.telefono ?? '') === (actual.telefono ?? '') &&
    (expected.identificacion ?? '') === (actual.identificacion ?? '') &&
    (expected.direccion ?? '') === (actual.direccion ?? '') &&
    (expected.activo ?? true) === (actual.activo ?? true)
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const sb = useMemo(() => getSupabase(), []);
  const useRemote = isSupabaseConfigured();
  const { session } = useAuth();

  const [cases, setCases] = useState<Case[]>(() => (useRemote ? [] : mockCases));
  const [allInvoices, setAllInvoices] = useState<CaseInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>(() => (useRemote ? [] : mockClients));
  const [societies, setSocieties] = useState<Society[]>(() => (useRemote ? [] : mockSocieties));
  const [societyServices, setSocietyServices] = useState<SocietyService[]>(() => (useRemote ? [] : mockSocietyServices));
  const [societyServiceLinks, setSocietyServiceLinks] = useState<SocietyServiceLink[]>(() => (useRemote ? [] : mockSocietyServiceLinks));
  const [services, setServices] = useState<Service[]>(() => (useRemote ? [] : mockServices));
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>(() => (useRemote ? [] : mockServiceItems));
  const [etapas, setEtapas] = useState<Etapa[]>(() => (useRemote ? [] : mockEtapas));
  const [usuarios, setUsuarios] = useState<Usuario[]>(() => (useRemote ? [] : mockUsuarios));
  const [invoiceTerms, setInvoiceTerms] = useState<InvoiceTerm[]>(() => (useRemote ? [] : mockInvoiceTerms));
  const [categories, setCategories] = useState<Category[]>(() => (useRemote ? [] : mockCategories));
  const [qbItems, setQbItems] = useState<QBItem[]>(() => (useRemote ? [] : mockQBItems));
  const [directores, setDirectores] = useState<Director[]>(() => (useRemote ? [] : mockDirectores));

  // Cache por usuario para evitar "mezclar" casos entre sesiones.
  const CACHE_KEY = `ancori_app_cache_v1:${session?.user?.id ?? 'anon'}`;
  const applyLoadedData = useCallback((data: Awaited<ReturnType<typeof db.loadAllFromSupabase>>) => {
    setClients(data.clients);
    setSocieties(data.societies);
    setSocietyServices(data.societyServices ?? []);
    setSocietyServiceLinks(data.societyServiceLinks ?? []);
    setServices(data.services);
    setServiceItems(data.serviceItems);
    setEtapas(data.etapas);
    setUsuarios(data.usuarios);
    setInvoiceTerms(data.invoiceTerms);
    setCategories(data.categories);
    setQbItems(data.qbItems);
    setDirectores(data.directores);
    setCases(data.cases);
    setAllInvoices(data.allInvoices);
  }, []);

  useEffect(() => {
    if (!useRemote || !sb) return;
    let cancelled = false;
    (async () => {
      // 1) Cache local para evitar pantalla vacía al refrescar
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
          if (!cancelled) applyLoadedData(cached);
        }
      } catch {
        // ignore cache parsing errors
      }

      try {
        // 2) Reintento corto para mitigar fallos intermitentes de red/session
        let data: Awaited<ReturnType<typeof db.loadAllFromSupabase>> | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            data = await db.loadAllFromSupabase(sb);
            break;
          } catch (e) {
            lastError = e;
            await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
          }
        }
        if (!data) throw (lastError ?? new Error('No se pudo cargar desde Supabase'));

        if (cancelled) return;
        applyLoadedData(data);

        // 3) Guardar cache de último estado bueno
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch {
          // ignore storage write errors
        }

        if (data.loadWarnings.length) {
          toast.warning(
            `Datos sincronizados con Supabase. Algunas tablas no cargaron (revisa SQL/políticas): ${data.loadWarnings.slice(0, 3).join(' · ')}${data.loadWarnings.length > 3 ? '…' : ''}`,
            { duration: 12_000 },
          );
        }
      } catch (e) {
        console.error(e);
        // Si falla remoto, mantenemos cache (si existe) para evitar "pantalla en blanco".
        // Solo si no hay cache visible, usamos mock como último recurso.
        const hasVisibleData =
          cases.length || clients.length || societies.length || services.length || serviceItems.length;
        if (!hasVisibleData) {
          setClients(mockClients);
          setSocieties(mockSocieties);
          setSocietyServices(mockSocietyServices);
          setSocietyServiceLinks(mockSocietyServiceLinks);
          setServices(mockServices);
          setServiceItems(mockServiceItems);
          setEtapas(mockEtapas);
          setUsuarios(mockUsuarios);
          setInvoiceTerms(mockInvoiceTerms);
          setCategories(mockCategories);
          setQbItems(mockQBItems);
          setDirectores(mockDirectores);
          setCases(mockCases);
        }
        toast.error('No se pudo refrescar desde Supabase. Mostrando datos locales/cache.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useRemote, sb, applyLoadedData, CACHE_KEY]);

  const addCase = useCallback((c: Case) => {
    setCases(prev => [c, ...prev]);
    // Mantener cache local consistente: si refresco falla, no "desaparece" el caso nuevo.
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
        const next = {
          ...cached,
          cases: [c, ...(cached.cases ?? []).filter(x => x.id !== c.id)],
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore cache update errors
    }
    if (sb) {
      void (async () => {
        try {
          const { error } = await withTimeout(db.insertCase(sb, c), 30_000, 'Crear caso (Supabase)');
          if (error) throw error;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(msg);
          setCases(prev => prev.filter(x => x.id !== c.id));
          // Revertir también cache
          try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
              const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
              const next = { ...cached, cases: (cached.cases ?? []).filter(x => x.id !== c.id) };
              localStorage.setItem(CACHE_KEY, JSON.stringify(next));
            }
          } catch {
            // ignore
          }
        }
      })();
    }
  }, [sb, CACHE_KEY]);

  const updateCase = useCallback((c: Case) => {
    setCases(prev => {
      const previous = prev.find(x => x.id === c.id);
      if (sb) {
        void (async () => {
          try {
            const { error } = await withTimeout(db.updateCaseRow(sb, c), 30_000, 'Actualizar caso (Supabase)');
            if (error) throw error;
          } catch (e) {
            if (!previous) return;
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(msg);
            setCases(pp => pp.map(x => x.id === c.id ? previous : x));
          }
        })();
      }
      return prev.map(x => x.id === c.id ? c : x);
    });
  }, [sb]);

  const addComment = useCallback((caseId: string, comment: CaseComment) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, comments: [...c.comments, comment] } : c));
    if (sb) {
      void db.insertComment(sb, comment).then(({ error }) => {
        if (error) {
          toast.error(error.message);
          setCases(prev => prev.map(c =>
            c.id === caseId ? { ...c, comments: c.comments.filter(x => x.id !== comment.id) } : c
          ));
        }
      });
    }
  }, [sb]);

  const addExpense = useCallback((caseId: string, expense: CaseExpense) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, expenses: [...c.expenses, expense] } : c));
    if (sb) {
      void db.insertExpense(sb, caseId, expense).then(({ error }) => {
        if (error) {
          toast.error(error.message);
          setCases(prev => prev.map(c =>
            c.id === caseId ? { ...c, expenses: c.expenses.filter(x => x.id !== expense.id) } : c
          ));
        }
      });
    }
  }, [sb]);

  const updateExpenses = useCallback((caseId: string, expenses: CaseExpense[]) => {
    setCases(prev => {
      const previous = prev.find(c => c.id === caseId)?.expenses ?? [];
      if (sb) {
        void db.replaceCaseExpenses(sb, caseId, expenses).then(({ error }) => {
          if (error) {
            toast.error(error.message);
            setCases(pp => pp.map(c => c.id === caseId ? { ...c, expenses: previous } : c));
          }
        });
      }
      return prev.map(c => c.id === caseId ? { ...c, expenses } : c);
    });
  }, [sb]);

  const saveInvoice = useCallback(async (caseId: string, invoice: CaseInvoice, isEdit: boolean): Promise<boolean> => {
    try {
      if (sb) {
        const op = isEdit ? db.updateInvoice(sb, invoice) : db.insertInvoice(sb, invoice);
        const { error } = await withTimeout(op, 30_000, 'Guardar factura (Supabase)');
        if (error) {
          toast.error(error.message);
          return false;
        }
      }
      setAllInvoices(prev => {
        if (isEdit) return prev.map(i => (i.id === invoice.id ? invoice : i));
        if (prev.some(i => i.id === invoice.id)) return prev.map(i => (i.id === invoice.id ? invoice : i));
        return [...prev, invoice];
      });
      setCases(prev => prev.map(c => {
        if (c.id !== caseId) return c;
        const invoices = isEdit
          ? c.invoices.map(i => i.id === invoice.id ? invoice : i)
          : [...c.invoices, invoice];
        return { ...c, invoices };
      }));
      return true;
    } catch (e) {
      console.error(e);
      toast.error(`Error al guardar la factura: ${String(e)}`);
      return false;
    }
  }, [sb]);

  const patchInvoice = useCallback((invoiceId: string, patch: Partial<CaseInvoice>) => {
    setAllInvoices(prev => prev.map(i => (i.id === invoiceId ? { ...i, ...patch } : i)));
    setCases(prev => prev.map(c => ({
      ...c,
      invoices: c.invoices.map(inv => (inv.id === invoiceId ? { ...inv, ...patch } : inv)),
    })));
  }, []);

  const deleteInvoice = useCallback(async (caseId: string, invoiceId: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteInvoiceRow(sb, invoiceId);
      if (error) { toast.error(error.message); return false; }
    }
    setAllInvoices(prev => prev.filter(i => i.id !== invoiceId));
    setCases(prev => prev.map(c => ({
      ...c,
      invoices: c.invoices.filter(i => i.id !== invoiceId),
    })));
    return true;
  }, [sb]);

  const removeCase = useCallback(async (id: string): Promise<boolean> => {
    let removed: Case | null = null;
    setCases(prev => {
      removed = prev.find(c => c.id === id) ?? null;
      return prev.filter(c => c.id !== id);
    });
    if (sb) {
      const { error } = await db.deleteCaseRow(sb, id);
      if (error) {
        toast.error(error.message);
        if (removed) setCases(prev => [removed, ...prev]);
        return false;
      }
    }
    return true;
  }, [sb]);

  /**
   * Recarga `clients` desde Supabase y sincroniza estado + cache.
   * Esta lectura usa el cliente Supabase nativo. Las mutaciones de clientes
   * sí usan AbortSignal conectado + verificación posterior por `id`.
   * Declarado ANTES de saveClient/deleteClient para evitar TDZ en dependency arrays.
   */
  const refreshClients = useCallback(async (): Promise<void> => {
    if (!sb) return;
    console.log('[refreshClients] iniciando...');
    try {
      const { data, error } = await sb
        .from('clients')
        .select('*')
        .order('numero', { ascending: true });
      if (error) {
        console.error('[refreshClients] ERROR Supabase:', error);
        return;
      }
      const fresh = (data ?? []).map(r => db.rowToClient(r as Record<string, unknown>));
      console.log(`[refreshClients] ${fresh.length} clientes sincronizados.`);
      setClients(fresh);
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cached, clients: fresh }));
        }
      } catch { /* ignore */ }
    } catch (e) {
      console.error('[refreshClients] Exception:', e);
    }
  }, [sb, CACHE_KEY]);

  const saveClient = useCallback(async (client: Client, isEdit: boolean): Promise<boolean> => {
    if (!client.nombre?.trim()) {
      toast.error('Nombre cliente es obligatorio');
      return false;
    }
    if (!sb) {
      setClients(prev => isEdit ? prev.map(c => c.id === client.id ? client : c) : [...prev, client]);
      return true;
    }

    console.log('[saveClient] start', { isEdit, id: client.id, nombre: client.nombre });
    console.time('[saveClient] op');

    try {
      // Timeout conectado al request real. Si aborta, verificamos por `id` para
      // resolver el estado ambiguo antes de decir si falló o guardó.
      if (isEdit) {
        try {
          await withAbortableClientRequest(
            'Actualizar cliente',
            CLIENT_MUTATION_TIMEOUT_MS,
            signal => db.updateClientRow(sb, client, signal),
          );
        } catch (e) {
          if (!isAbortLikeError(e)) throw e;
          console.warn('[saveClient] Update abortado; verificando estado real en DB...', e);
          const verify = await withAbortableClientRequest(
            'Verificar cliente actualizado',
            CLIENT_VERIFY_TIMEOUT_MS,
            signal => db.getClientById(sb, client.id, signal),
          );
          if (verify.error || !verify.data) throw e;
          const persisted = db.rowToClient(verify.data as Record<string, unknown>);
          if (!clientFieldsMatch(client, persisted)) throw e;
        }
        console.timeEnd('[saveClient] op');
        console.log('[saveClient] updated', { id: client.id });
        const saved = client;
        setClients(prev => prev.map(c => c.id === saved.id ? saved : c));
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              ...cached,
              clients: cached.clients.map((c: Client) => c.id === saved.id ? saved : c),
            }));
          }
        } catch { /* ignore */ }
      } else {
        // insertClient confirma el INSERT con retorno mínimo. No esperamos una lectura
        // adicional para no bloquear la UI en conexiones lentas.
        try {
          await withAbortableClientRequest(
            'Crear cliente',
            CLIENT_MUTATION_TIMEOUT_MS,
            signal => db.insertClient(sb, client, signal),
          );
        } catch (e) {
          if (!isAbortLikeError(e)) throw e;
          console.warn('[saveClient] Insert abortado; verificando si el cliente fue creado...', e);
          const verify = await withAbortableClientRequest(
            'Verificar cliente creado',
            CLIENT_VERIFY_TIMEOUT_MS,
            signal => db.getClientById(sb, client.id, signal),
          );
          if (verify.error || !verify.data) throw e;
        }
        console.timeEnd('[saveClient] op');
        const saved = client;
        setClients(prev => [saved, ...prev]);
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              ...cached,
              clients: [saved, ...(cached.clients ?? []).filter((c: Client) => c.id !== saved.id)],
            }));
          }
        } catch { /* ignore */ }
        // Refrescar en segundo plano para traer el `numero` real asignado por Postgres.
        void refreshClients();
      }
    } catch (e) {
      console.timeEnd('[saveClient] op');
      console.error('[saveClient] Exception:', e);
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout/i.test(msg);
      toast.error(
        isTimeout
          ? 'La operación tardó demasiado. Verifica tu conexión e intenta de nuevo.'
          : `Error al guardar el cliente: ${msg}`,
      );
      return false;
    }

    return true;
  }, [sb, CACHE_KEY, refreshClients]);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    const linkedSocieties = societies.filter(s => s.client_id === id);
    if (linkedSocieties.length > 0) {
      toast.error(
        `No se puede eliminar el cliente porque tiene ${linkedSocieties.length} sociedad(es) asociada(s). Reasígnalas o elimínalas primero.`,
      );
      return false;
    }

    if (sb) {
      try {
        console.log('[deleteClient] eliminando id:', id);
        let count: number | null = null;
        let error: unknown = null;
        try {
          const res = await withAbortableClientRequest(
            'Eliminar cliente',
            CLIENT_MUTATION_TIMEOUT_MS,
            signal => db.deleteClientRow(sb, id, signal),
          );
          count = res.count;
          error = res.error;
        } catch (e) {
          if (!isAbortLikeError(e)) throw e;
          console.warn('[deleteClient] Delete abortado; verificando si el cliente sigue existiendo...', e);
          const verify = await withAbortableClientRequest(
            'Verificar cliente eliminado',
            CLIENT_VERIFY_TIMEOUT_MS,
            signal => db.getClientById(sb, id, signal),
          );
          if (!verify.error && !verify.data) {
            count = 1;
            error = null;
          } else {
            throw e;
          }
        }
        if (error) {
          toast.error(error instanceof Error ? error.message : String(error));
          return false;
        }
        if (count === 0) {
          toast.error('Supabase no eliminó el cliente. Puede estar bloqueado por permisos/RLS o registros relacionados.');
          return false;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[deleteClient] Exception:', e);
        toast.error(
          /abort|timeout/i.test(msg)
            ? 'La eliminación tardó demasiado. Verifica tu conexión e intenta de nuevo.'
            : `Error al eliminar: ${msg}`,
        );
        return false;
      }
      // Delete confirmado por Supabase → actualizar estado local y cache directamente.
      // No llamar refreshClients() — evita SELECT innecesario de cientos de filas.
      setClients(prev => prev.filter(c => c.id !== id));
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            ...cached,
            clients: (cached.clients ?? []).filter((c: Client) => c.id !== id),
          }));
        }
      } catch { /* ignore */ }
      return true;
    }
    // Sin Supabase (modo demo): eliminación local directa.
    setClients(prev => prev.filter(c => c.id !== id));
    return true;
  }, [sb, CACHE_KEY, societies]);

  const saveSociety = useCallback(async (society: Society, isEdit: boolean): Promise<boolean> => {
    try {
      if (sb) {
        const op = isEdit ? db.updateSocietyRow(sb, society) : db.insertSociety(sb, society);
        const res = await withTimeout(op, 30_000, 'Guardar sociedad (Supabase)');
        if (res.error) {
          toast.error(res.error.message);
          return false;
        }
      }
      // Guardar/actualizar local de inmediato (UI rápida).
      // QBO está desactivado temporalmente: no enviar ni marcar columnas qbo_sync_*.
      const merged: Society = { ...society };
      setSocieties(prev => (isEdit ? prev.map(s => s.id === merged.id ? merged : s) : [...prev, merged]));
      return true;
    } catch (e) {
      toast.error(`Error al guardar la sociedad: ${String(e)}`);
      return false;
    }
  }, [sb]);

  const deleteSociety = useCallback(async (id: string): Promise<boolean> => {
    // Desactivado temporalmente por solicitud: no tocar QuickBooks al borrar sociedades.
    if (sb) {
      const { error } = await db.deleteSocietyRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setSocieties(prev => prev.filter(s => s.id !== id));
    setSocietyServiceLinks(prev => prev.filter(l => l.sociedad_id !== id));
    return true;
  }, [sb, societies]);

  const saveSocietyService = useCallback(async (service: SocietyService, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit
        ? await sb.from('servicios').update({ nombre: service.nombre, activo: service.activo }).eq('id', service.id)
        : await db.insertSocietyService(sb, service);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setSocietyServices(prev => (isEdit ? prev.map(s => s.id === service.id ? service : s) : [...prev, service]));
    return true;
  }, [sb]);

  const syncSocietyServices = useCallback(async (societyId: string, serviceIds: string[]): Promise<boolean> => {
    if (serviceIds.length === 0 && societyServices.length === 0) return true;
    const activeIds = new Set(societyServices.filter(s => s.activo).map(s => s.id));
    const ids = [...new Set(serviceIds.filter(id => activeIds.has(id)))];
    if (ids.length !== new Set(serviceIds.filter(Boolean)).size) {
      toast.error('Uno o más servicios no existen o están inactivos.');
      return false;
    }
    if (sb) {
      const res = await db.syncSocietyServices(sb, societyId, ids);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setSocietyServiceLinks(prev => [
      ...prev.filter(l => l.sociedad_id !== societyId),
      ...ids.map(servicio_id => ({
        id: crypto.randomUUID(),
        sociedad_id: societyId,
        servicio_id,
        created_at: new Date().toISOString().split('T')[0],
      })),
    ]);
    return true;
  }, [sb, societyServices]);

  const saveService = useCallback(async (service: Service, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateServiceRow(sb, service) : await db.insertService(sb, service);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setServices(prev => (isEdit ? prev.map(s => s.id === service.id ? service : s) : [...prev, service]));
    return true;
  }, [sb]);

  const deleteService = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteServiceRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setServices(prev => prev.filter(s => s.id !== id));
    return true;
  }, [sb]);

  const saveServiceItem = useCallback(async (item: ServiceItem, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateServiceItemRow(sb, item) : await db.insertServiceItem(sb, item);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setServiceItems(prev => (isEdit ? prev.map(x => x.id === item.id ? item : x) : [...prev, item]));
    return true;
  }, [sb]);

  const deleteServiceItem = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteServiceItemRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setServiceItems(prev => prev.filter(x => x.id !== id));
    return true;
  }, [sb]);

  const saveEtapa = useCallback(async (e: Etapa, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateEtapaRow(sb, e) : await db.insertEtapa(sb, e);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setEtapas(prev => (isEdit ? prev.map(x => x.id === e.id ? e : x) : [...prev, e]));
    return true;
  }, [sb]);

  const deleteEtapa = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteEtapaRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setEtapas(prev => prev.filter(x => x.id !== id));
    return true;
  }, [sb]);

  const saveUsuario = useCallback(async (u: Usuario, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateUsuarioRow(sb, u) : await db.insertUsuario(sb, u);
      if (res.error) { toast.error(res.error.message); return false; }
    }
    setUsuarios(prev => (isEdit ? prev.map(x => x.id === u.id ? u : x) : [...prev, u]));
    return true;
  }, [sb]);

  const deleteUsuario = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteUsuarioRow(sb, id);
      if (error) { toast.error(error.message); return false; }
    }
    setUsuarios(prev => prev.filter(x => x.id !== id));
    return true;
  }, [sb]);

  const saveInvoiceTerm = useCallback(async (term: InvoiceTerm, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateInvoiceTermRow(sb, term) : await db.insertInvoiceTerm(sb, term);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setInvoiceTerms(prev => (isEdit ? prev.map(t => t.id === term.id ? term : t) : [...prev, term]));
    return true;
  }, [sb]);

  const deleteInvoiceTerm = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteInvoiceTermRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setInvoiceTerms(prev => prev.filter(t => t.id !== id));
    return true;
  }, [sb]);

  const saveCategory = useCallback(async (c: Category, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateCategoryRow(sb, c) : await db.insertCategory(sb, c);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setCategories(prev => (isEdit ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]));
    return true;
  }, [sb]);

  const deleteCategory = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteCategoryRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setCategories(prev => prev.filter(x => x.id !== id));
    return true;
  }, [sb]);

  const saveQBItem = useCallback(async (item: QBItem, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateQBItemRow(sb, item) : await db.insertQBItem(sb, item);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setQbItems(prev => (isEdit ? prev.map(q => q.id === item.id ? item : q) : [...prev, item]));
    return true;
  }, [sb]);

  const deleteQBItem = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteQBItemRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setQbItems(prev => prev.filter(q => q.id !== id));
    return true;
  }, [sb]);

  const saveDirector = useCallback(async (d: Director, isEdit: boolean): Promise<boolean> => {
    try {
      if (sb) {
        const op = isEdit ? db.updateDirectorRow(sb, d) : db.insertDirector(sb, d);
        const res = await withTimeout(op, 30_000, 'Guardar director (Supabase)');
        if (res.error) {
          toast.error(res.error.message);
          return false;
        }
        if (!isEdit && res.data) {
          const saved = db.rowToDirector(res.data as unknown as Record<string, unknown>);
          setDirectores(prev => [...prev, saved]);
          return true;
        }
      }
      setDirectores(prev => (isEdit ? prev.map(x => x.id === d.id ? d : x) : [...prev, d]));
      return true;
    } catch (e) {
      toast.error(`Error al guardar el director: ${String(e)}`);
      return false;
    }
  }, [sb]);

  const deleteDirector = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteDirectorRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setDirectores(prev => prev.filter(x => x.id !== id));
    return true;
  }, [sb]);

  const getClientName = useCallback((id?: string) => clients.find(c => c.id === id)?.nombre || '', [clients]);
  const getSocietyName = useCallback((id?: string) => societies.find(s => s.id === id)?.nombre || '', [societies]);
  const getSocietyServiceIds = useCallback((societyId?: string) => {
    if (!societyId) return [];
    return societyServiceLinks
      .filter(l => l.sociedad_id === societyId)
      .map(l => l.servicio_id);
  }, [societyServiceLinks]);
  const getSocietyServiceNames = useCallback((societyId?: string) => {
    const ids = new Set(getSocietyServiceIds(societyId));
    return societyServices
      .filter(s => ids.has(s.id))
      .map(s => s.nombre);
  }, [getSocietyServiceIds, societyServices]);
  const getServiceName = useCallback((id?: string) => services.find(s => s.id === id)?.nombre || '', [services]);
  const getServiceItemName = useCallback((id?: string) => serviceItems.find(si => si.id === id)?.nombre || '', [serviceItems]);
  const getEtapaName = useCallback((id?: string) => {
    const e = etapas.find(x => x.id === id);
    return e ? `${e.n_etapa}. ${e.nombre}` : '';
  }, [etapas]);
  const getUsuarioName = useCallback((id?: string) => usuarios.find(u => u.id === id)?.nombre || '', [usuarios]);
  const getDirectorName = useCallback((id?: string) => directores.find(d => d.id === id)?.nombre || '', [directores]);

  return (
    <AppContext.Provider value={{
      cases, allInvoices, clients, societies, societyServices, societyServiceLinks, services, serviceItems, etapas, usuarios, invoiceTerms, categories, qbItems, directores,
      addCase, updateCase, addComment, addExpense, updateExpenses, saveInvoice, patchInvoice, deleteInvoice, removeCase,
      saveClient, deleteClient, saveSociety, deleteSociety, saveSocietyService, syncSocietyServices, saveService, deleteService,
      saveServiceItem, deleteServiceItem, saveEtapa, deleteEtapa, saveUsuario, deleteUsuario,
      saveInvoiceTerm, deleteInvoiceTerm, saveCategory, deleteCategory, saveQBItem, deleteQBItem,
      saveDirector, deleteDirector,
      getClientName, getSocietyName, getSocietyServiceIds, getSocietyServiceNames, getServiceName, getServiceItemName, getEtapaName, getUsuarioName, getDirectorName,
      refreshClients,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
