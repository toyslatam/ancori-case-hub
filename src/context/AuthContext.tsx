import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { getSupabase, getSupabaseConfig } from '@/lib/supabaseClient';

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
    const fallback: AuthUser = {
      id: authUser.id,
      email: authUser.email,
      nombre: authUser.email.split('@')[0],
      initials: authUser.email[0].toUpperCase(),
    };
    const sb = getSupabase();
    if (!sb) return fallback;
    try {
      const { data } = await sb
        .from('usuarios')
        .select('nombre, rol, puesto')
        .ilike('correo', authUser.email)
        .maybeSingle();
      const nombre = data?.nombre ?? fallback.nombre;
      return {
        id: authUser.id,
        email: authUser.email,
        nombre,
        rol: data?.rol,
        puesto: data?.puesto,
        initials: getInitials(nombre),
      };
    } catch {
      return fallback;
    }
  }

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }

    // Timeout de seguridad: si en 6 s no resuelve, liberar el spinner
    const safetyTimer = setTimeout(() => setLoading(false), 6000);

    // Sesión inicial
    sb.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        setSession(s);
        setUser(await enrichUser(s?.user ?? null));
      })
      .catch(() => { /* sesión no disponible */ })
      .finally(() => {
        clearTimeout(safetyTimer);
        setLoading(false);
      });

    // Escuchar cambios de sesión (login / logout / refresh)
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(await enrichUser(s?.user ?? null));
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase no configurado' };
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Correo o contraseña incorrectos' };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (e) {
      const msg = String(e);
      // Navegador suele lanzar TypeError: Failed to fetch ante CORS/DNS/offline/SSL bloqueado
      if (/failed to fetch/i.test(msg)) {
        // Diagnóstico rápido: el health endpoint requiere apikey; si responde, la red llega.
        const { url, anonKey } = getSupabaseConfig();
        if (url && anonKey) {
          try {
            const controller = new AbortController();
            const tid = window.setTimeout(() => controller.abort(), 6000);
            const res = await fetch(`${url.replace(/\\/$/, '')}/auth/v1/health`, {
              headers: { apikey: anonKey },
              signal: controller.signal,
            }).finally(() => window.clearTimeout(tid));
            if (res.ok) {
              return {
                error:
                  'No se pudo conectar con Supabase (Failed to fetch). La red sí llega a Supabase, así que suele ser bloqueo del navegador (extensión/adblock), proxy corporativo, o un error CORS. Prueba modo incógnito sin extensiones o otra red (hotspot).',
              };
            }
          } catch {
            // si hasta este fetch falla, es red/DNS/SSL/proxy
          }
        }
        return {
          error:
            'No se pudo conectar con el servidor (Failed to fetch). Esto suele ser red/VPN/DNS/SSL/proxy bloqueando `*.supabase.co`. Prueba otra red (hotspot) o pide a TI permitir `supabase.co` por HTTPS (443).',
        };
      }
      return { error: `Error de red: ${msg}` };
    }
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
