import type { RecorderMode } from '../app/session-recorder';

/** Development build: test mode, so recordings keep values and text for generating specs. */
export const environment: { name: string; version: string; recorderMode?: RecorderMode } = {
  name: 'dev',
  version: '0.0.0-dev',
  recorderMode: 'test',
};
