import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewForm } from './foundation';
it('validates an entry and makes its unsaved preview explicit', async () => {
  const user = userEvent.setup();
  render(<PreviewForm />);
  await user.type(screen.getByLabelText('Institution name'), 'A');
  await user.click(screen.getByRole('button', { name: 'Preview entry' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter at least 3 characters.',
  );
  await user.type(screen.getByLabelText('Institution name'), 'BC');
  await user.click(screen.getByRole('button', { name: 'Preview entry' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Preview: ABC. Nothing has been saved.',
  );
});
