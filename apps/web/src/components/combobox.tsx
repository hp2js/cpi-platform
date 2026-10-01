import { Check, ChevronDown, Search } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fieldControl } from '@/components/ui/input';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text shown under the label and searched too, e.g. an institution name. */
  description?: string;
  disabled?: boolean;
}

/** Long lists are filtered, not scrolled: only the first matches are rendered. */
const MAX_RENDERED = 100;

/**
 * A select with a search box, for long lists such as institutions or officers. The trigger is
 * a button labelled by the field's <Label htmlFor={id}>; the popup follows the WAI-ARIA
 * combobox-with-listbox pattern (arrow keys, Home/End, Enter to choose, Escape to close).
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  searchPlaceholder = 'Type to search',
  emptyText = 'No matches.',
  allOption,
  disabled,
  invalid,
  className,
  describedBy,
}: {
  id: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** An extra first option with the empty value, e.g. "All institutions". */
  allOption?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const all = useMemo(
    () => (allOption ? [{ value: '', label: allOption }, ...options] : options),
    [allOption, options],
  );
  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length
      ? all.filter((option) => {
          const text =
            `${option.label} ${option.description ?? ''}`.toLowerCase();
          return terms.every((term) => text.includes(term));
        })
      : all;
  }, [all, query]);
  const shown = matches.slice(0, MAX_RENDERED);
  const selected = all.find((option) => option.value === value);

  function openWith(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery('');
      setActive(
        Math.max(
          0,
          all.findIndex((option) => option.value === value),
        ),
      );
    }
  }

  function choose(option: ComboboxOption | undefined) {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  }

  function move(to: number) {
    const next = Math.min(Math.max(to, 0), shown.length - 1);
    setActive(next);
    document
      .getElementById(optionId(next))
      ?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(active + 1),
      ArrowUp: () => move(active - 1),
      Home: () => move(0),
      End: () => move(shown.length - 1),
      PageDown: () => move(active + 10),
      PageUp: () => move(active - 10),
      Enter: () => choose(shown[active]),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            fieldControl,
            'flex h-touch max-w-(--field-max) items-center justify-between gap-2 text-left',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-base')}>
            {selected
              ? selected.description
                ? `${selected.label} · ${selected.description}`
                : selected.label
              : placeholder}
          </span>
          <ChevronDown
            className="size-5 shrink-0 text-ink"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={searchPlaceholder}
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        {/* The row, icon and all, is the field: its focus ring is drawn inside the popup edge. */}
        <div
          data-focus-within
          className="flex items-center gap-2 border-b border-base-lighter px-3"
        >
          <Search
            className="size-4 shrink-0 text-base-dark"
            aria-hidden="true"
          />
          <input
            role="combobox"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={shown[active] ? optionId(active) : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="h-touch w-full bg-transparent text-sm outline-none placeholder:text-base"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={searchPlaceholder}
          className="max-h-72 overflow-y-auto py-1"
        >
          {shown.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value || '__all'}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={cn(
                  'flex min-h-touch cursor-pointer items-start gap-2 px-2 py-2 text-sm',
                  index === active && 'bg-primary-lighter text-primary-darker',
                  option.disabled && 'cursor-not-allowed text-disabled',
                )}
              >
                <Check
                  className={cn(
                    'mt-1 size-4 shrink-0',
                    isSelected ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs text-base-dark">
                      {option.description}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p
          className="border-t border-base-lighter px-2 py-2 text-xs text-base-dark"
          aria-live="polite"
        >
          {matches.length === 0
            ? emptyText
            : matches.length > shown.length
              ? `Showing ${shown.length} of ${matches.length}. Type to narrow the list.`
              : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}
        </p>
      </PopoverContent>
    </Popover>
  );
}
