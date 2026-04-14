import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Case, Category, Client, Director, Etapa, Society, Service, ServiceItem, Usuario, InvoiceTerm, QBItem,
  mockCases, mockCategories, mockClients, mockDirectores, mockEtapas, mockSocieties, mockServices, mockServiceItems, mockUsuarios, mockInvoiceTerms, mockQBItems,
  CaseComment, CaseExpense, CaseInvoice,
} from '@/data/mockData';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  isQboSocietyPushConfigured,
  pushSocietyToQuickbooksDelete,
  pushSocietyToQuickbooksUpsert,
} from '@/lib/qboIntegration';
import * as db from '@/lib/supabaseDb';

interface AppContextType {
  cases: Case[];
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const sb = useMemo(() => getSupabase(), []);
  const useRemote = isSupabaseConfigured();

  const [cases, setCases] = useState<Case[]>(() => (useRemote ? [] : mockCases));
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

  useEffect(() => {
    if (!useRemote || !sb) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await db.loadAllFromSupabase(sb);
        if (cancelled) return;
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
        if (data.loadWarnings.length) {
          toast.warning(
            `Datos sincronizados con Supabase. Algunas tablas no cargaron (revisa SQL/políticas): ${data.loadWarnings.slice(0, 3).join(' · ')}${data.loadWarnings.length > 3 ? '…' : ''}`,
            { duration: 12_000 },
          );
        }
      } catch (e) {
        console.error(e);
        toast.error('No se pudo cargar desde Supabase; usando datos locales.');
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
    })();
    return () => {
      cancelled = true;
    };
  }, [useRemote, sb]);

  const addCase = useCallback((c: Case) => {
    setCases(prev => [c, ...prev]);
    if (sb) {
      void db.insertCase(sb, c).then(({ error }) => {
        if (error) {
          toast.error(error.message);
          setCases(prev => prev.filter(x => x.id !== c.id));
        }
      });
    }
  }, [sb]);

  const updateCase = useCallback((c: Case) => {
    setCases(prev => {
      const previous = prev.find(x => x.id === c.id);
      if (sb) {
        void db.updateCaseRow(sb, c).then(({ error }) => {
          if (error && previous) {
            toast.error(error.message);
            setCases(pp => pp.map(x => x.id === c.id ? previous : x));
          }
        });
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
    const { error } = isEdit
      ? await db.updateInvoice(sb!, invoice)
      : await db.insertInvoice(sb!, invoice);
    if (error) { toast.error(error.message); return false; }
    setCases(prev => prev.map(c => {
      if (c.id !== caseId) return c;
      const invoices = isEdit
        ? c.invoices.map(i => i.id === invoice.id ? invoice : i)
        : [...c.invoices, invoice];
      return { ...c, invoices };
    }));
    return true;
  }, [sb]);

  const deleteInvoice = useCallback(async (caseId: string, invoiceId: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteInvoiceRow(sb, invoiceId);
      if (error) { toast.error(error.message); return false; }
    }
    setCases(prev => prev.map(c =>
      c.id !== caseId ? c : { ...c, invoices: c.invoices.filter(i => i.id !== invoiceId) }
    ));
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
    if (sb) {
      const res = isEdit ? await db.updateClientRow(sb, client) : await db.insertClient(sb, client);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setClients(prev => (isEdit ? prev.map(c => c.id === client.id ? client : c) : [...prev, client]));
    return true;
  }, [sb]);

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    if (sb) {
      const { error } = await db.deleteClientRow(sb, id);
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setClients(prev => prev.filter(c => c.id !== id));
    return true;
  }, [sb]);

  const saveSociety = useCallback(async (society: Society, isEdit: boolean): Promise<boolean> => {
    if (sb) {
      const res = isEdit ? await db.updateSocietyRow(sb, society) : await db.insertSociety(sb, society);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    let merged: Society = society;
    if (sb && isQboSocietyPushConfigured()) {
      try {
        const qb = await pushSocietyToQuickbooksUpsert(society);
        if (qb.quickbooks_customer_id || qb.id_qb != null) {
          merged = { ...society };
          if (qb.quickbooks_customer_id) merged = { ...merged, quickbooks_customer_id: qb.quickbooks_customer_id };
          if (qb.id_qb != null) merged = { ...merged, id_qb: qb.id_qb };
        }
        const needsPatch =
          (qb.quickbooks_customer_id && !society.quickbooks_customer_id) ||
          (qb.id_qb != null && qb.id_qb !== society.id_qb);
        if (needsPatch) {
          const { error: patchErr } = await db.updateSocietyRow(sb, merged);
          if (patchErr) {
            toast.warning(`QuickBooks enlazado; no se guardó el Id en la base: ${patchErr.message}`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Sociedad guardada; QuickBooks: ${msg}`);
      }
    }
    setSocieties(prev => (isEdit ? prev.map(s => s.id === merged.id ? merged : s) : [...prev, merged]));
    return true;
  }, [sb]);

  const deleteSociety = useCallback(async (id: string): Promise<boolean> => {
    const society = societies.find(s => s.id === id);
    const qbIdDelete =
      society?.quickbooks_customer_id?.trim() ||
      (society?.id_qb != null ? String(society.id_qb) : '');
    if (sb && society && isQboSocietyPushConfigured() && qbIdDelete) {
      try {
        await pushSocietyToQuickbooksDelete(qbIdDelete);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.warning(`QuickBooks no actualizado (${msg}). Se elimina la sociedad solo en la app.`);
      }
    }
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
    if (sb) {
      const res = isEdit ? await db.updateDirectorRow(sb, d) : await db.insertDirector(sb, d);
      if (res.error) {
        toast.error(res.error.message);
        return false;
      }
    }
    setDirectores(prev => (isEdit ? prev.map(x => x.id === d.id ? d : x) : [...prev, d]));
    return true;
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
      cases, clients, societies, services, serviceItems, etapas, usuarios, invoiceTerms, categories, qbItems, directores,
      addCase, updateCase, addComment, addExpense, updateExpenses, saveInvoice, deleteInvoice, removeCase,
      saveClient, deleteClient, saveSociety, deleteSociety, saveService, deleteService,
      saveServiceItem, deleteServiceItem, saveEtapa, deleteEtapa, saveUsuario, deleteUsuario,
      saveInvoiceTerm, deleteInvoiceTerm, saveCategory, deleteCategory, saveQBItem, deleteQBItem,
      saveDirector, deleteDirector,
      getClientName, getSocietyName, getServiceName, getServiceItemName, getEtapaName, getUsuarioName, getDirectorName,
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
