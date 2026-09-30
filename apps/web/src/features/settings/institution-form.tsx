import type { AccountingOfficer, InstitutionType } from '@cpi/contracts';
import { SelectField } from '@/components/select-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Institution form sections shared by "Add institution" and the institution page, so the two
 * ask for the same things in the same order.
 */

export const emptyAccountingOfficer: AccountingOfficer = {
  name: '',
  designation: '',
  email: '',
  phone: '',
};

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  type = 'text',
  placeholder,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  type?: string;
  placeholder?: string;
  optional?: boolean;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal text-base-dark"> (optional)</span>
        )}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-base-dark">
          {hint}
        </p>
      )}
      {error && <p className="text-sm text-error-dark">{error}</p>}
    </div>
  );
}

export function InstitutionTypeSelect({
  id,
  value,
  onChange,
  types,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  types: InstitutionType[];
  error?: string;
}) {
  // A retired type stays selectable only on an institution that already has it.
  const options = types
    .filter((type) => type.active || type.id === value)
    .map((type) => ({
      value: type.id,
      label: type.active ? type.label : `${type.label} (retired)`,
    }));
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>Type</Label>
      <SelectField
        id={id}
        value={value}
        onChange={onChange}
        placeholder="Choose a type"
        options={options}
        invalid={Boolean(error)}
      />
      {error && <p className="text-sm text-error-dark">{error}</p>}
    </div>
  );
}

export function AccountingOfficerFields({
  idPrefix,
  value,
  onChange,
  errors = {},
}: {
  idPrefix: string;
  value: AccountingOfficer;
  onChange: (value: AccountingOfficer) => void;
  errors?: Record<string, string>;
}) {
  const set = (key: keyof AccountingOfficer) => (next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-bold">Accounting Officer</legend>
      <p className="text-xs text-base-dark">
        A contact, not a platform account. The Accounting Officer chairs the
        CPC; their approval of each report is recorded by reference when the
        focal person submits (PRD §7.2).
      </p>
      <div data-columns className="grid gap-3 tablet:grid-cols-2">
        <Field
          id={`${idPrefix}-ao-name`}
          label="Name"
          value={value.name}
          onChange={set('name')}
          error={errors['accountingOfficer.name']}
        />
        <Field
          id={`${idPrefix}-ao-designation`}
          label="Designation"
          placeholder="e.g. Director General"
          value={value.designation}
          onChange={set('designation')}
          error={errors['accountingOfficer.designation']}
        />
        <Field
          id={`${idPrefix}-ao-email`}
          label="Email"
          type="email"
          placeholder="name@example.invalid"
          optional
          value={value.email}
          onChange={set('email')}
          error={errors['accountingOfficer.email']}
        />
        <Field
          id={`${idPrefix}-ao-phone`}
          label="Phone"
          type="tel"
          optional
          value={value.phone}
          onChange={set('phone')}
          error={errors['accountingOfficer.phone']}
        />
      </div>
    </fieldset>
  );
}

export { Field as TextField };
