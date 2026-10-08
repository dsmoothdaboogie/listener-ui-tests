import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideSessionRecorder, sessionRecorderInterceptor } from './session-recorder';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // List the recorder's interceptor first so it sees every request.
    provideHttpClient(withInterceptors([sessionRecorderInterceptor])),
    provideSessionRecorder({
      mode: environment.recorderMode,
      attribute: 'data-testid',
      appVersion: environment.version,
      environment: environment.name,
      // The demo has no users. A real app injects its entitlement service here.
      canRecord: () => true,
    }),
  ],
};
