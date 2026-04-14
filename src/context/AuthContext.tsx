import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabaseClient';

interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  rol?: string;
  puesto?: string;
  initials: string;
}

interface AuthContextType {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Convierte auth user → AuthUser (enriquecido con datos de la tabla usuarios)
  async function enrichUser(authUser: User | null): Promise<AuthUser | null> {
    if (!authUser?.email) return null;
    const sb = getSupabase();
    if (!sb) {
      return {
        id: authUser.id,
        email: authUser.email,
        nombre: authUser.email.split('@')[0],
        initials: authUser.email[0].toUpperCase(),
      };
    }
    const { data } = await sb
      .from('usuarios')
      .select('nombre, rol, puesto')
      .ilike('correo', authUser.email)
      .maybeSingle();

    const nombre = data?.nombre ?? authUser.email.split('@')[0];
    return {
      id: authUser.id,
      email: authUser.email,
      nombre,
      rol: data?.rol,
      puesto: data?.puesto,
      initials: getInitials(nombre),
    };
  }

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }

    // Sesión inicial
    sb.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(await enrichUser(s?.user ?? null));
      setLoading(false);
    });

    // Escuchar cambios de sesión
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(await enrichUser(s?.user ?? null));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase no configurado' };
    const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Correo o contraseña incorrectos' };
      }
      return { error: error.message };
    }
    return { error: null };
  };

  const signOut = async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
