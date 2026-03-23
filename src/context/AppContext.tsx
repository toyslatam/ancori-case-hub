import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  Case, Client, Society, Service, InvoiceTerm, QBItem,
  mockCases, mockClients, mockSocieties, mockServices, mockInvoiceTerms, mockQBItems,
  CaseComment, CaseExpense, CaseInvoice,
} from '@/data/mockData';

interface AppContextType {
  cases: Case[];
  clients: Client[];
  societies: Society[];
  services: Service[];
  invoiceTerms: InvoiceTerm[];
  qbItems: QBItem[];
  setCases: React.Dispatch<React.SetStateAction<Case[]>>;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setSocieties: React.Dispatch<React.SetStateAction<Society[]>>;
  setServices: React.Dispatch<React.SetStateAction<Service[]>>;
  setInvoiceTerms: React.Dispatch<React.SetStateAction<InvoiceTerm[]>>;
  setQbItems: React.Dispatch<React.SetStateAction<QBItem[]>>;
  addCase: (c: Case) => void;
  updateCase: (c: Case) => void;
  addComment: (caseId: string, comment: CaseComment) => void;
  addExpense: (caseId: string, expense: CaseExpense) => void;
  updateExpenses: (caseId: string, expenses: CaseExpense[]) => void;
  getClientName: (id?: string) => string;
  getSocietyName: (id?: string) => string;
  getServiceName: (id?: string) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<Case[]>(mockCases);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [societies, setSocieties] = useState<Society[]>(mockSocieties);
  const [services, setServices] = useState<Service[]>(mockServices);
  const [invoiceTerms, setInvoiceTerms] = useState<InvoiceTerm[]>(mockInvoiceTerms);
  const [qbItems, setQbItems] = useState<QBItem[]>(mockQBItems);

  const addCase = (c: Case) => setCases(prev => [c, ...prev]);
  const updateCase = (c: Case) => setCases(prev => prev.map(x => x.id === c.id ? c : x));

  const addComment = (caseId: string, comment: CaseComment) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, comments: [...c.comments, comment] } : c));
  };

  const addExpense = (caseId: string, expense: CaseExpense) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, expenses: [...c.expenses, expense] } : c));
  };

  const updateExpenses = (caseId: string, expenses: CaseExpense[]) => {
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, expenses } : c));
  };

  const getClientName = (id?: string) => clients.find(c => c.id === id)?.nombre || '';
  const getSocietyName = (id?: string) => societies.find(s => s.id === id)?.nombre || '';
  const getServiceName = (id?: string) => services.find(s => s.id === id)?.nombre || '';

  return (
    <AppContext.Provider value={{
      cases, clients, societies, services, invoiceTerms, qbItems,
      setCases, setClients, setSocieties, setServices, setInvoiceTerms, setQbItems,
      addCase, updateCase, addComment, addExpense, updateExpenses,
      getClientName, getSocietyName, getServiceName,
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
