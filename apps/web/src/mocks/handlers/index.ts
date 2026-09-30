import { annualHandlers } from './annual';
import { devHandlers } from './dev';
import { oversightHandlers } from './oversight';
import { simulationHandlers } from './simulation';
import { directoryHandlers } from './directory';
import { eventHandlers } from './events';
import { faultHandlers } from './faults';
import { formHandlers } from './forms';
import { foundationHandlers } from './foundations';
import { planningHandlers } from './planning';
import { fileHandlers } from './files';
import { planEditorHandlers } from './plan-editor';
import { reportingHandlers } from './reporting';
import { reviewHandlers } from './review';
import { accountHandlers } from './account';
import { adminHandlers } from './admin';
import { sessionHandlers } from './session';
import { settingsHandlers } from './settings';
import { supervisionHandlers } from './supervision';

export const handlers = [
  // First, so an armed fault intercepts the next matching request.
  ...faultHandlers,
  ...sessionHandlers,
  ...accountHandlers,
  ...directoryHandlers,
  ...formHandlers,
  ...reportingHandlers,
  ...reviewHandlers,
  ...planningHandlers,
  ...fileHandlers,
  ...planEditorHandlers,
  ...foundationHandlers,
  ...eventHandlers,
  ...annualHandlers,
  ...simulationHandlers,
  ...oversightHandlers,
  ...settingsHandlers,
  ...supervisionHandlers,
  ...adminHandlers,
  ...devHandlers,
];
