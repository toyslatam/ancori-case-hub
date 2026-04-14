import { useRef, useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboOption {
  value: string;
  label: string;
  /** Texto secundario que se muestra debajo del label en dos líneas */
  sublabel?: string;
}

interface SearchableComboProps {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableCombo({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  emptyLabel = 'Sin resultados',
  className,
  disabled = false,
}: SearchableComboProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const handleSelect = (val: string) => {
    onChange(val === value ? '' : val);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            selected?.sublabel ? 'h-auto py-2' : 'truncate',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          {selected ? (
            selected.sublabel ? (
              <span className="flex flex-col items-start text-left min-w-0 overflow-hidden">
                <span className="truncate w-full text-sm font-medium leading-tight">{selected.label}</span>
                <span className="truncate w-full text-xs text-muted-foreground leading-tight mt-0.5">
                  — {selected.sublabel}
                </span>
              </span>
            ) : (
              <span className="truncate">{selected.label}</span>
            )
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        avoidCollisions={false}
        className="w-[--radix-popover-trigger-width] p-0 z-[200]"
        onOpenAutoFocus={e => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                  value === opt.value && 'bg-accent/50',
                )}
              >
                <Check className={cn('h-4 w-4 shrink-0 mt-0.5', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                {opt.sublabel ? (
                  <span className="flex flex-col items-start min-w-0 overflow-hidden">
                    <span className={cn('truncate w-full leading-snug', value === opt.value && 'font-semibold')}>
                      {opt.label}
                    </span>
                    <span className="truncate w-full text-xs text-muted-foreground leading-snug">
                      — {opt.sublabel}
                    </span>
                  </span>
                ) : (
                  <span className={cn('truncate', value === opt.value && 'font-medium')}>{opt.label}</span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
