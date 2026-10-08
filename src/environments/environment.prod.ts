import type { RecorderMode } from '../app/session-recorder';

/** Production build: recorderMode stays unset, so the recorder fails closed to support mode. */
export const environment: { name: string; version: string; recorderMode?: RecorderMode } = {
  name: 'prod',
  version: '0.0.0',
};
