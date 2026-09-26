import { devHandlers } from './dev';
import { directoryHandlers } from './directory';
import { eventHandlers } from './events';
import { formHandlers } from './forms';
import { foundationHandlers } from './foundations';
import { planningHandlers } from './planning';
import { reportingHandlers } from './reporting';
import { reviewHandlers } from './review';
import { sessionHandlers } from './session';

export const handlers = [
  ...sessionHandlers,
  ...directoryHandlers,
  ...formHandlers,
  ...reportingHandlers,
  ...reviewHandlers,
  ...planningHandlers,
  ...foundationHandlers,
  ...eventHandlers,
  ...devHandlers,
];
