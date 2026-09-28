import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Radix Select cannot hold an empty value, so "All …" options use this stand-in. */
const EMPTY = '__none__';

/**
 * The app's select for short, fixed lists (a quarter, a role, a category). It looks and
 * behaves like `Combobox`, which is used instead when a list is long or needs searching.
 * Label it with <Label htmlFor={id}>.
 */
export function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  describedBy?: string;
}) {
  return (
    <Select
      // An empty value shows the placeholder, unless the list has an "All …" option for it.
      value={
        value === '' && options.some((option) => option.value === '')
          ? EMPTY
          : value
      }
      onValueChange={(next) => onChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={className}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || EMPTY}
            value={option.value === '' ? EMPTY : option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
