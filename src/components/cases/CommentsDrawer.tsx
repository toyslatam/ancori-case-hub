import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { Case, CaseComment } from '@/data/mockData';
import { Send } from 'lucide-react';

interface CommentsDrawerProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

/** Genera iniciales (hasta 2 letras) a partir de un nombre */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Paleta de colores para los avatares según iniciales */
const AVATAR_COLORS = [
  'bg-amber-700',
  'bg-purple-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-rose-600',
  'bg-orange-600',
  'bg-teal-600',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const month = months[d.getMonth()];
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

export function CommentsDrawer({ caseData, open, onClose }: CommentsDrawerProps) {
  const { addComment } = useApp();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!caseData) return null;

  const sorted = [...(caseData.comments ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    const comment: CaseComment = {
      id: crypto.randomUUID(),
      case_id: caseData.id,
      user_name: 'Usuario Actual',
      comentario: trimmed,
      created_at: new Date().toISOString(),
    };
    addComment(caseData.id, comment);
    setText('');
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 gap-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-bold">Comentarios</DialogTitle>
        </DialogHeader>

        {/* Cuerpo */}
        <div className="flex flex-col gap-0 max-h-[70vh]">

          {/* Textarea para nuevo comentario */}
          <div className="px-6 pt-4 pb-3 border-b border-border">
            <div className="flex gap-2">
              <Textarea
                placeholder="Añadir Comentario"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={3}
                className="flex-1 resize-none rounded-xl bg-muted/50 border-muted-foreground/20 focus:ring-1 focus:ring-primary"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
              />
              <Button
                onClick={handleSend}
                size="icon"
                disabled={!text.trim() || sending}
                className="self-end h-9 w-9 rounded-xl"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Lista de comentarios */}
          <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Sin comentarios aún — sé el primero en comentar.
              </p>
            ) : sorted.map(c => (
              <CommentItem key={c.id} comment={c} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommentItem({ comment }: { comment: CaseComment }) {
  const initials = getInitials(comment.user_name);
  const color    = avatarColor(comment.user_name);

  return (
    <div className="flex items-start gap-3">
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>
        {initials}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-bold text-foreground">{comment.user_name}</span>
          <span className="text-xs text-muted-foreground">{formatCommentDate(comment.created_at)}</span>
        </div>
        <div className="bg-amber-800 text-white text-sm rounded-lg px-4 py-2.5 leading-relaxed break-words">
          {comment.comentario}
        </div>
      </div>
    </div>
  );
}
