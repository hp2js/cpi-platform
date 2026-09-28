import type { ReportAnswers } from '@cpi/contracts';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';

/**
 * Report form whose defaults track the last saved answers. useForm re-applies defaultValues on
 * every render, so the defaults must move with each save or a clean form would revert.
 */
export function useSavedDefaultsForm(initial: ReportAnswers) {
  const [defaults, setDefaults] = useState(initial);
  const form = useForm({ defaultValues: defaults });
  const markSaved = (values: ReportAnswers) => {
    setDefaults(values);
    form.reset(values);
  };
  return { form, markSaved };
}
