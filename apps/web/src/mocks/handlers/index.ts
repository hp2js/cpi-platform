import { devHandlers } from './dev';
import { directoryHandlers } from './directory';
import { formHandlers } from './forms';
import { reportingHandlers } from './reporting';
import { reviewHandlers } from './review';
import { sessionHandlers } from './session';

export const handlers = [
  ...sessionHandlers,
  ...directoryHandlers,
  ...formHandlers,
  ...reportingHandlers,
  ...reviewHandlers,
  ...devHandlers,
];
