export default function ConfigPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Integraciones</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div>
              <h3 className="font-medium">QuickBooks Online</h3>
              <p className="text-sm text-muted-foreground">Conecta tu cuenta de QuickBooks para sincronizar facturas</p>
            </div>
            <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">Pendiente de configuración</span>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h2 className="text-lg font-semibold mb-4">Roles y Usuarios</h2>
        <p className="text-sm text-muted-foreground">Módulo preparado para administración de usuarios con roles: Admin, Operador, Consulta.</p>
      </div>
    </div>
  );
}
