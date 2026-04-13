/** Página reservada; la app principal enruta el inicio a Casos vía `App.tsx`. */
export default function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Plataforma Ancori</h1>
      <p className="text-sm text-muted-foreground">Seguimiento de casos y mantenimiento</p>
    </div>
  );
}
