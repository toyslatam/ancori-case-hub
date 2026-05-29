import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder, FileText, File, Sheet,
  Upload, ExternalLink, Edit3, ChevronRight, Loader2,
  RefreshCw, AlertCircle, FolderOpen, Link2, Search, Check,
} from 'lucide-react';
import {
  listSharePointFiles,
  getSharePointEditLink,
  getSharePointViewLink,
  uploadSharePointFile,
  listSharePointSocietyFolders,
  getSpMapping,
  saveSpMapping,
  type SPItem,
} from '@/lib/sharepointApi';

interface SharePointDocsPanelProps {
  entityId: string;
  entityType: 'client' | 'society';
  entityName: string;
  open: boolean;
  onClose: () => void;
}

function fileIcon(item: SPItem) {
  if (item.folder) return <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  const name = item.name.toLowerCase();
  if (name.endsWith('.pdf'))                       return <File         className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (name.endsWith('.docx') || name.endsWith('.doc')) return <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />;
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return <Sheet    className="h-4 w-4 text-green-600 flex-shrink-0" />;
  return <File className="h-4 w-4 text-slate-400 flex-shrink-0" />;
}

function isWordDoc(item: SPItem) {
  const n = item.name.toLowerCase();
  return n.endsWith('.docx') || n.endsWith('.doc');
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function SharePointDocsPanel({ entityId, entityType, entityName, open, onClose }: SharePointDocsPanelProps) {
  const [items, setItems]             = useState<SPItem[]>([]);
  const [driveId, setDriveId]         = useState<string | undefined>();
  const [mappedFolder, setMappedFolder] = useState<string | undefined>();
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const [subfolder, setSubfolder]     = useState<string | undefined>();
  const [actionId, setActionId]       = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Asignación de carpeta
  const [showAssign, setShowAssign]     = useState(false);
  const [allFolders, setAllFolders]     = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  async function load(folder: string, sub?: string, drive?: string) {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await listSharePointFiles(folder, drive ?? driveId, sub);
      setItems(result.items);
      setDriveId(result.drive_id);
      if (result.folder_not_found) {
        setNotFound(true);
        openAssignPanel(result.drive_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openAssignPanel(drive?: string) {
    setShowAssign(true);
    if (allFolders.length > 0) return;
    setLoadingFolders(true);
    try {
      const result = await listSharePointSocietyFolders(drive ?? driveId);
      setAllFolders(result.folders);
      if (result.drive_id && !driveId) setDriveId(result.drive_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFolders(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setSubfolder(undefined);
    setItems([]);
    setNotFound(false);
    setShowAssign(false);
    setFolderSearch('');
    setAllFolders([]);

    (async () => {
      const saved = await getSpMapping(entityId);
      if (saved) {
        // Mapeo guardado → cargar archivos directamente
        setMappedFolder(saved);
        await load(saved, undefined, undefined);
      } else {
        // Sin mapeo → mostrar buscador de carpetas inmediatamente
        setMappedFolder(undefined);
        await openAssignPanel(undefined);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId, entityName]);

  async function handleSelectFolder(folder: string) {
    setSavingMapping(true);
    try {
      await saveSpMapping(entityId, entityType, entityName, folder);
      setMappedFolder(folder);
      setShowAssign(false);
      setSubfolder(undefined);
      await load(folder, undefined, driveId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleOpenFolder(item: SPItem) {
    const newSub = subfolder ? `${subfolder}/${item.name}` : item.name;
    setSubfolder(newSub);
    await load(mappedFolder ?? entityName, newSub, driveId);
  }

  function handleBack() {
    if (!subfolder) return;
    const parts = subfolder.split('/');
    parts.pop();
    const newSub = parts.length ? parts.join('/') : undefined;
    setSubfolder(newSub);
    load(mappedFolder ?? entityName, newSub, driveId);
  }

  async function handleView(item: SPItem) {
    if (!driveId) return;
    setActionId(item.id);
    try {
      const { url } = await getSharePointViewLink(item.id, driveId);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionId(null);
    }
  }

  async function handleEdit(item: SPItem) {
    if (!driveId) return;
    setActionId(item.id + '_edit');
    try {
      const { url } = await getSharePointEditLink(item.id, driveId);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionId(null);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadSharePointFile(mappedFolder ?? entityName, file, driveId);
      await load(mappedFolder ?? entityName, subfolder, driveId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const breadcrumb = subfolder ? subfolder.split('/') : [];
  const filteredFolders = allFolders.filter(f =>
    !folderSearch.trim() || f.toLowerCase().includes(folderSearch.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold truncate">
                Documentos — {entityName}
              </DialogTitle>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {mappedFolder && mappedFolder !== entityName && (
                  <span className="text-amber-600 font-medium">📁 {mappedFolder}</span>
                )}
                {/* Breadcrumb */}
                {!showAssign && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setSubfolder(undefined); load(mappedFolder ?? entityName, undefined, driveId); }}
                      className="hover:text-foreground transition-colors"
                    >
                      Raíz
                    </button>
                    {breadcrumb.map((part, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3" />
                        <span
                          className={i === breadcrumb.length - 1 ? 'text-foreground font-medium' : 'hover:text-foreground cursor-pointer transition-colors'}
                          onClick={() => {
                            if (i < breadcrumb.length - 1) {
                              const newSub = breadcrumb.slice(0, i + 1).join('/');
                              setSubfolder(newSub);
                              load(mappedFolder ?? entityName, newSub, driveId);
                            }
                          }}
                        >{part}</span>
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAssignPanel(driveId)}
                className="h-8 px-2 text-xs gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                title="Cambiar carpeta de SharePoint"
              >
                <Link2 className="h-3.5 w-3.5" />
                Carpeta
              </Button>
              {!showAssign && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => load(mappedFolder ?? entityName, subfolder, driveId)}
                    disabled={loading}
                    className="h-8 px-2"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || loading || notFound}
                    className="h-8 gap-1.5"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Subir
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-[300px] max-h-[65vh] overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 break-all">{error}</p>
            </div>
          )}

          {/* ── Panel de asignación de carpeta ───────────────────────── */}
          {showAssign && (
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-amber-500" />
                <p className="text-sm font-semibold">
                  {mappedFolder ? 'Cambiar carpeta vinculada' : 'Vincular carpeta de SharePoint'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Selecciona la carpeta de <em>SOCIEDADES Y FUNDACIONES</em> que corresponde a{' '}
                <strong>{entityName}</strong>. Se guardará permanentemente y solo cambia si lo haces manualmente.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar carpeta..."
                  value={folderSearch}
                  onChange={e => setFolderSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                  autoFocus
                />
              </div>
              {loadingFolders ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando carpetas de SharePoint…
                </div>
              ) : (
                <ul className="rounded-lg border border-border divide-y max-h-64 overflow-y-auto">
                  {filteredFolders.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground text-center">Sin resultados</li>
                  ) : filteredFolders.map(f => (
                    <li key={f}>
                      <button
                        type="button"
                        disabled={savingMapping}
                        onClick={() => void handleSelectFolder(f)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-amber-50 transition-colors"
                      >
                        {savingMapping ? (
                          <Loader2 className="h-4 w-4 animate-spin text-amber-500 flex-shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate">{f}</span>
                        {f === mappedFolder && (
                          <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mappedFolder && !notFound && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAssign(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          )}

          {/* ── Lista de archivos ────────────────────────────────────── */}
          {!showAssign && (
            <>
              {loading && items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm">Cargando documentos…</p>
                </div>
              )}

              {subfolder && !loading && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-2 w-full px-6 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors border-b border-border"
                >
                  <Folder className="h-4 w-4" />
                  .. (volver)
                </button>
              )}

              {!loading && items.length > 0 && (
                <ul className="divide-y divide-border">
                  {items.map(item => (
                    <li key={item.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors">
                      {fileIcon(item)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(item.lastModifiedDateTime)}
                          {item.lastModifiedBy?.user?.displayName && ` · ${item.lastModifiedBy.user.displayName}`}
                          {item.size ? ` · ${fmtSize(item.size)}` : ''}
                          {item.folder ? ` · ${item.folder.childCount} elemento${item.folder.childCount !== 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.folder ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => handleOpenFolder(item)}>
                            <FolderOpen className="h-3.5 w-3.5" /> Abrir
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline" size="sm"
                              className="h-7 px-2 text-xs gap-1"
                              disabled={actionId === item.id}
                              onClick={() => handleView(item)}
                            >
                              {actionId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                              Ver
                            </Button>
                            {isWordDoc(item) && (
                              <Button
                                variant="outline" size="sm"
                                className="h-7 px-2 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                                disabled={actionId === item.id + '_edit'}
                                onClick={() => handleEdit(item)}
                              >
                                {actionId === item.id + '_edit' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Edit3 className="h-3 w-3" />}
                                Editar
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!loading && !notFound && items.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <FolderOpen className="h-8 w-8" />
                  <p className="text-sm">Carpeta vacía</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            SharePoint · SOCIEDADES Y FUNDACIONES
            {mappedFolder ? ` · ${mappedFolder}` : ''}
            {' '}· Edición en Word Online (nueva pestaña)
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
