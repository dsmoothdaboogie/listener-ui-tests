import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { RECORDER_CONFIG, SessionRecorderConfig, resolveRecorderConfig } from './recorder.tokens';
import { SessionRecorder } from './session-recorder.service';

export function provideSessionRecorder(config: SessionRecorderConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: RECORDER_CONFIG, useValue: resolveRecorderConfig(config) },
    provideAppInitializer(() => inject(SessionRecorder).init()),
  ]);
}
