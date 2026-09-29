import { test, expect, type Locator, type Page } from '@playwright/test';
import { reset, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

async function choose(
  page: Page,
  scope: Locator,
  label: string,
  option: RegExp | string,
) {
  await scope.getByRole('combobox', { name: label }).click();
  await page
    .getByRole(
      'option',
      typeof option === 'string'
        ? { name: option, exact: true }
        : { name: option },
    )
    .click();
}

test('the institution plans a quarter, proposes it, and sees which checks failed on return (FR04)', async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'focal-demo-001', '/institution/plan');
  await expect(
    page.getByRole('heading', { name: 'Plan approval' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add risk' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add a risk' });
  await dialog.getByLabel('Code').fill('R-03');
  await dialog
    .getByLabel('Risk', { exact: true })
    .fill('Collusion in appointment panels');
  await dialog
    .getByLabel('Cause')
    .fill('Panel members are not asked to declare interests.');
  await choose(page, dialog, 'Probability (1–5)', '3 Possible');
  await choose(page, dialog, 'Impact (1–5)', '5 Severe');
  await dialog.getByRole('button', { name: 'Add risk' }).click();
  await expect(dialog).toBeHidden();
  const risks = page.getByRole('region', { name: 'Risk register' });
  await expect(
    risks.getByRole('row', { name: /R-03 Collusion in appointment panels/ }),
  ).toContainText(/3 Possible\s*5 Severe\s*15/);

  await page.getByRole('button', { name: 'Add activity' }).click();
  dialog = page.getByRole('dialog', { name: 'Add an activity' });
  await dialog.getByLabel('Code').fill('A-04');
  await choose(page, dialog, 'Risk treated', /R-03/);
  await dialog
    .getByLabel('Activity', { exact: true })
    .fill('Declare interests before each panel');
  await dialog.getByLabel('Strategy').fill('Require declarations and recusal.');
  await dialog.getByLabel('Output').fill('Declaration register');
  await dialog
    .getByLabel('Key performance indicator')
    .fill('Panels with complete declarations');
  await dialog.getByLabel('Target').fill('100% from Q3');
  await dialog.getByLabel('Responsible').fill('Head of human resources');
  await dialog.getByRole('button', { name: 'Add activity' }).click();
  await expect(dialog).toBeHidden();

  const q3 = page.getByRole('article', { name: /Q3 baseline/ });
  await q3.getByRole('button', { name: 'Add Q3 milestone' }).click();
  dialog = page.getByRole('dialog', { name: 'Add a Q3 milestone' });
  await dialog.getByLabel('Code').fill('M-30');
  await choose(page, dialog, 'Activity', /A-04/);
  await dialog
    .getByLabel('Milestone', { exact: true })
    .fill('Declaration register in use');
  await dialog
    .getByLabel('Completion condition')
    .fill('Every Q3 panel has signed declarations on file.');
  await dialog
    .getByLabel('Evidence expected')
    .fill('Declaration register extract');
  await dialog.getByRole('button', { name: 'Add milestone' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    q3.getByText(/You changed the Q3 milestones after version 1 was proposed/),
  ).toBeVisible();

  await q3.getByRole('button', { name: 'Propose Q3 again' }).click();
  dialog = page.getByRole('dialog', { name: 'Propose the Q3 baseline' });
  await dialog
    .getByLabel('Note to your officer (optional)')
    .fill('Adds the declaration register for the new panel risk.');
  await dialog.getByRole('button', { name: 'Send for approval' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', {
      name: /Q3 baseline · version 2 · 5 milestones/,
    }),
  ).toBeVisible();

  await visit(page, 'officer-a', '/officer/institutions/DEMO-001');
  const proposal = page.getByRole('article').filter({ hasText: 'Q3' }).first();
  await expect(proposal).toContainText(
    'R-03 Collusion in appointment panels (severity 15): 1 milestone',
  );
  await proposal
    .getByLabel('Some completion conditions are not objective')
    .check();
  await proposal
    .getByLabel('Feedback for the institution')
    .fill('M-30 should name who checks the declarations.');
  await proposal.getByRole('button', { name: 'Return for revision' }).click();
  await expect(
    proposal.getByText('Returned for revision').first(),
  ).toBeVisible();

  await visit(page, 'focal-demo-001', '/institution');
  const todo = page
    .getByRole('listitem')
    .filter({ hasText: 'Revise and propose your Q3 baseline again' });
  await expect(todo).toContainText(
    'some completion conditions are not objective',
  );
  await todo.getByRole('link', { name: /Open plan/ }).click();
  await expect(
    page.getByRole('article', { name: /Q3 baseline/ }).getByRole('button', {
      name: 'Propose Q3 again',
    }),
  ).toBeVisible();
});

test('the institution imports its plan from a CSV after a row-by-row check (FR04)', async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'focal-demo-007', '/institution/plan');
  await page.getByRole('button', { name: 'Import from CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import your plan' });
  const header =
    'record,code,link,quarter,title,cause,probability,impact,strategy,output,kpi,target,owner,resource,completion_condition,evidence_expectation';
  const upload = (rows: string[]) =>
    dialog.getByLabel('CSV file').setInputFiles({
      name: 'plan.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([header, ...rows].join('\n')),
    });
  const risk =
    'risk,R-03,,,Conflicts of interest in panels,Panel members are not asked to declare,3,4,,,,,,,,';
  const activity =
    'activity,A-05,R-03,,Declare conflicts before each panel,,,,Require declarations,Declaration register,Panels with full declarations,100%,Bursary secretary,,,';

  await upload([
    risk,
    activity,
    'milestone,M-50,A-05,Q1,Declarations checked,,,,,,,,,,Declarations were checked for every panel.,Register extract',
  ]);
  await expect(
    dialog.getByText(/2 ready, 1 row needs attention/),
  ).toBeVisible();
  await expect(
    dialog.getByText(/The Q1 baseline is approved or locked/),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Import/ })).toBeDisabled();

  await upload([
    risk,
    activity,
    'milestone,M-50,A-05,Q3,Declarations checked,,,,,,,,,,Declarations were checked for every panel.,Register extract',
  ]);
  await dialog.getByRole('button', { name: 'Import 3 rows' }).click();
  await expect(
    dialog.getByText('Imported 1 risk, 1 activity and 1 milestone.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Mitigation activities' })
      .getByRole('row', { name: /A-05 Declare conflicts/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: /Q3 baseline/ }).getByRole('row', {
      name: /M-50 Declarations checked/,
    }),
  ).toBeVisible();
});

test('the administrator sets when baseline proposals are due and labels the risk scale (FR04)', async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'administrator', '/admin/calendar');
  await page.getByLabel('Baseline proposals due').fill('21');
  await page
    .getByLabel('Reason for the change')
    .fill('Officers asked for three weeks to review proposals.');
  await page.getByRole('button', { name: 'Save calendar' }).click();
  await expect(page.getByText('Calendar saved')).toBeVisible();
  await expect(
    page.getByText(/Baseline proposals due 14 → 21 days before each quarter/),
  ).toBeVisible();

  // The scale lives under Forms & scoring, with its own reason and change log.
  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: 'Risk rating scale' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Risk rating scale', level: 1 }),
  ).toBeVisible();
  await page.getByLabel('Probability 3').fill('Moderately likely');
  await page
    .getByLabel('Source of these labels')
    .fill('EACC risk assessment template, 23rd Cycle guidelines, page 4.');
  await page
    .getByLabel('Reason for the change')
    .fill('Labels confirmed against the EACC template.');
  await page.getByRole('button', { name: 'Save scale' }).click();
  await expect(page.getByText('Risk rating scale saved')).toBeVisible();
  await expect(
    page.getByText(
      /Probability labels → 1 Rare, 2 Unlikely, 3 Moderately likely/,
    ),
  ).toBeVisible();

  await visit(page, 'officer-a', '/officer/rules');
  await expect(
    page.getByRole('region', { name: 'Risk rating scale' }),
  ).toContainText('Moderately likely');

  await visit(page, 'focal-demo-001', '/institution/plan');
  await expect(
    page
      .getByRole('article', { name: /Q3 baseline/ })
      .getByText(/Propose by Fri 11 Dec 2026, 23:59 EAT/),
  ).toBeVisible();
  const register = page.getByRole('region', { name: 'Risk register' });
  await expect(register.getByRole('row', { name: /R-01/ })).toContainText(
    '3 Moderately likely',
  );
  await expect(register).toContainText(
    'Scale labels: EACC risk assessment template, 23rd Cycle guidelines, page 4.',
  );
  await expect(
    page.getByText(
      /Every milestone carries weight 1 in this simulation profile/,
    ),
  ).toBeVisible();
});
