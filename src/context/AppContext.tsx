import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Case, Category, Client, Director, Etapa, Society, Service, ServiceItem, Usuario, InvoiceTerm, QBItem,
  mockCases, mockCategories, mockClients, mockDirectores, mockEtapas, mockSocieties, mockServices, mockServiceItems, mockUsuarios, mockInvoiceTerms, mockQBItems,
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

export function AppProvider({ children }: { children: ReactNode }) {
  const sb = useMemo(() => getSupabase(), []);
  const useRemote = isSupabaseConfigured();
  const { session } = useAuth();

  const [cases, setCases] = useState<Case[]>(() => (useRemote ? [] : mockCases));
  const [allInvoices, setAllInvoices] = useState<CaseInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>(() => (useRemote ? [] : mockClients));
  const [societies, setSocieties] = useState<Society[]>(() => (useRemote ? [] : mockSocieties));
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

  const saveClient = useCallback(async (client: Client, isEdit: boolean): Promise<boolean> => {
    if (!client.nombre?.trim()) {
      toast.error('Nombre cliente es obligatorio');
      return false;
    }
    if (!sb) {
      // Sin Supabase: solo actualizar estado local (modo demo/dev).
      setClients(prev => isEdit ? prev.map(c => c.id === client.id ? client : c) : [...prev, client]);
      return true;
    }

    console.log('[saveClient] start', { isEdit, id: client.id, nombre: client.nombre });

    // AbortController 10s para detectar si es red o DB.
    const controller = new AbortController();
    const abortTid = window.setTimeout(() => {
      controller.abort();
      console.error('[saveClient] Abort (10s): Supabase no respondió. Posible problema de red/DNS/proxy.');
    }, 10_000);

    try {
      console.time('[saveClient] SUPABASE op');
      let res: Awaited<ReturnType<typeof db.insertClient>> | Awaited<ReturnType<typeof db.updateClientRow>>;

      if (isEdit) {
        res = await db.updateClientRow(sb, client);
      } else {
        // insertClient ya elimina `numero` y hace .select('*').single()
        res = await db.insertClient(sb, client);
      }
      console.timeEnd('[saveClient] SUPABASE op');
      console.log('[saveClient] result', { data: (res as any).data ?? null, error: res.error ?? null });

      if (res.error) {
        console.error('[saveClient] SUPABASE ERROR:', res.error);
        toast.error(res.error.message);
        return false;
      }
    } catch (e) {
      window.clearTimeout(abortTid);
      console.error('[saveClient] Exception:', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort/i.test(msg)) {
        toast.error('Tiempo de espera agotado (10s). Supabase no respondió. Verifica tu conexión.');
        // Diagnóstico adicional
        const cfg = getSupabaseConfig();
        console.warn('[saveClient] Config Supabase:', { url: cfg.url, anonKeyPresent: Boolean(cfg.anonKey) });
        try { await db.testClientsSelectLatency(sb); } catch { /* diagnóstico falló */ }
      } else {
        toast.error(`Error al guardar el cliente: ${msg}`);
      }
      return false;
    } finally {
      window.clearTimeout(abortTid);
    }

    // Sincronizar estado desde DB (no confiar en updates optimistas).
    await refreshClients();
    return true;
  }, [sb, refreshClients]);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const controller = new AbortController();
      const abortTid = window.setTimeout(() => {
        controller.abort();
        console.error('[deleteClient] Abort (10s): Supabase no respondió.');
      }, 10_000);
      try {
        const { error } = await db.deleteClientRow(sb, id);
        if (error) {
          toast.error(error.message);
          return false;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(/abort/i.test(msg) ? 'Tiempo de espera agotado al eliminar. Verifica tu conexión.' : `Error al eliminar: ${msg}`);
        return false;
      } finally {
        window.clearTimeout(abortTid);
      }
      // Recargar desde DB para evitar que el item "reaparezca" por cache.
      await refreshClients();
      return true;
    }
    // Sin Supabase (modo demo): eliminación optimista.
    setClients(prev => prev.filter(c => c.id !== id));
    return true;
  }, [sb, refreshClients]);

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
      // Guardar/actualizar local de inmediato (UI rápida)
      const merged: Society = {
        ...society,
        qbo_sync_status: 'pending',
        qbo_sync_attempts: society.qbo_sync_attempts ?? 0,
      };
      setSocieties(prev => (isEdit ? prev.map(s => s.id === merged.id ? merged : s) : [...prev, merged]));

      // Encolar sync a QBO en segundo plano (no await QBO).
      // La cola vive en Supabase; un worker (Edge Function cron) procesa los pending.
      if (sb) {
        void (async () => {
          try {
            // 1) Marcar estado pending en la sociedad (best-effort, no bloquear UI)
            await withTimeout(
              sb.from('societies').update({
                qbo_sync_status: 'pending',
                qbo_sync_last_error: null,
              }).eq('id', society.id),
              5_000,
              'Marcar sync_status pending (Sociedad)',
            );

            // 2) Crear job pending (best-effort). Evita duplicados exactos por sociedad+status en memoria.
            await withTimeout(
              sb.from('qbo_society_sync_jobs').insert({
                society_id: society.id,
                operation: 'upsert',
                status: 'pending',
              }),
              5_000,
              'Encolar sync QBO (Sociedad)',
            );
          } catch (e) {
            console.warn('[saveSociety] enqueue qbo sync failed:', e);
          }
        })();
      }
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
    return true;
  }, [sb, societies]);

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

  /**
   * Recarga `clients` directamente desde Supabase (10s timeout).
   * - Actualiza el estado local.
   * - Actualiza el cache del usuario.
   * - Distingue timeout de error real en consola.
   */
  const refreshClients = useCallback(async (): Promise<void> => {
    if (!sb) return;
    console.log('[refreshClients] iniciando...');
    const controller = new AbortController();
    const tid = window.setTimeout(() => {
      controller.abort();
      console.warn('[refreshClients] Abortado por timeout (10s). Posible problema de red/DNS con Supabase.');
    }, 10_000);
    try {
      const { data, error } = await sb
        .from('clients')
        .select('*')
        .order('numero', { ascending: true })
        .abortSignal(controller.signal);
      window.clearTimeout(tid);
      if (error) {
        console.error('[refreshClients] ERROR Supabase:', error);
        return;
      }
      const fresh = (data ?? []).map(r => db.rowToClient(r as Record<string, unknown>));
      console.log(`[refreshClients] ${fresh.length} clientes cargados desde Supabase.`);
      setClients(fresh);
      // Actualizar cache del usuario para que recarga no traiga datos viejos.
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as Awaited<ReturnType<typeof db.loadAllFromSupabase>>;
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cached, clients: fresh }));
        }
      } catch {
        // ignore
      }
    } catch (e) {
      window.clearTimeout(tid);
      const msg = e instanceof Error ? e.message : String(e);
      if (/abort/i.test(msg)) {
        console.error('[refreshClients] Timeout/Abort (10s): Supabase no respondió. Revisa red/DNS/proxy.');
      } else {
        console.error('[refreshClients] Exception:', e);
      }
    }
  }, [sb, CACHE_KEY]);

  const getClientName = useCallback((id?: string) => clients.find(c => c.id === id)?.nombre || '', [clients]);
  const getSocietyName = useCallback((id?: string) => societies.find(s => s.id === id)?.nombre || '', [societies]);
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
      cases, allInvoices, clients, societies, services, serviceItems, etapas, usuarios, invoiceTerms, categories, qbItems, directores,
      addCase, updateCase, addComment, addExpense, updateExpenses, saveInvoice, patchInvoice, deleteInvoice, removeCase,
      saveClient, deleteClient, saveSociety, deleteSociety, saveService, deleteService,
      saveServiceItem, deleteServiceItem, saveEtapa, deleteEtapa, saveUsuario, deleteUsuario,
      saveInvoiceTerm, deleteInvoiceTerm, saveCategory, deleteCategory, saveQBItem, deleteQBItem,
      saveDirector, deleteDirector,
      getClientName, getSocietyName, getServiceName, getServiceItemName, getEtapaName, getUsuarioName, getDirectorName,
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
