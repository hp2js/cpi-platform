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
import { reportingHandlers } from './reporting';
import { reviewHandlers } from './review';
import { sessionHandlers } from './session';

export const handlers = [
  // First, so an armed fault intercepts the next matching request.
  ...faultHandlers,
  ...sessionHandlers,
  ...directoryHandlers,
  ...formHandlers,
  ...reportingHandlers,
  ...reviewHandlers,
  ...planningHandlers,
  ...foundationHandlers,
  ...eventHandlers,
  ...annualHandlers,
  ...simulationHandlers,
  ...oversightHandlers,
  ...devHandlers,
];
