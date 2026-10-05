import type { InstitutionCreate } from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { institutionFormProblems } from './onboarding';

const filled: InstitutionCreate = {
  id: 'MDA-101',
  name: 'Demo Ports Authority',
  typeId: 'state-corporation',
  officerId: null,
  supervisorId: null,
  accountingOfficer: {
    name: 'Accounting Officer',
    designation: 'Managing Director',
    email: '',
    phone: '',
  },
  focalUser: null,
  seedOpenedQuarters: true,
};
const noFocal = null;

describe('Add institution form', () => {
  it('is ready with the required fields and no focal person', () => {
    expect(institutionFormProblems(filled, noFocal)).toEqual([]);
  });

  it('names each missing or malformed field instead of silently refusing', () => {
    // The focal person section is on by default: left empty, it blocks the form.
    expect(
      institutionFormProblems(filled, { displayName: '', email: '' }),
    ).toEqual([
      expect.stringMatching(/^Focal person name/),
      expect.stringMatching(/^Focal person email/),
    ]);
    expect(
      institutionFormProblems({ ...filled, id: 'MDA-1234' }, noFocal),
    ).toEqual([expect.stringMatching(/^Institution ID.*MDA-123/)]);
    expect(
      institutionFormProblems(
        {
          ...filled,
          name: 'X',
          typeId: '',
          accountingOfficer: {
            ...filled.accountingOfficer,
            name: 'AO',
            designation: '',
          },
        },
        noFocal,
      ),
    ).toHaveLength(4);
  });
});
