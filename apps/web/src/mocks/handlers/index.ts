import { devHandlers } from './dev';
import { directoryHandlers } from './directory';
import { sessionHandlers } from './session';

export const handlers = [
  ...sessionHandlers,
  ...directoryHandlers,
  ...devHandlers,
];
