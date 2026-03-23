import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import { Case, CaseComment } from '@/data/mockData';
import { Send } from 'lucide-react';

interface CommentsDrawerProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

export function CommentsDrawer({ caseData, open, onClose }: CommentsDrawerProps) {
  const { addComment } = useApp();
  const [text, setText] = useState('');

  if (!caseData) return null;

  const handleSend = () => {
    if (!text.trim()) return;
    const comment: CaseComment = {
      id: crypto.randomUUID(),
      case_id: caseData.id,
      user_name: 'Usuario Actual',
      comentario: text.trim(),
      created_at: new Date().toISOString(),
    };
    addComment(caseData.id, comment);
    setText('');
  };

  const sorted = [...caseData.comments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[420px] sm:w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Comentarios — Caso #{caseData.numero_caso}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin comentarios aún</p>}
          {sorted.map(c => (
            <div key={c.id} className="bg-muted rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{c.user_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('es-PA')} {new Date(c.created_at).toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-foreground">{c.comentario}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-3 flex gap-2">
          <Textarea placeholder="Escribir comentario..." value={text} onChange={e => setText(e.target.value)} rows={2} className="flex-1" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}} />
          <Button onClick={handleSend} size="icon" disabled={!text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
