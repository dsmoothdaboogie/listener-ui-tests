import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { SessionRecorder } from './session-recorder.service';

/** Correlates requests with the action that triggered them. Records method + id-free path only. */
export const sessionRecorderInterceptor: HttpInterceptorFn = (req, next) => {
  const done = inject(SessionRecorder).trackRequest(req.method, req.url);
  if (!done) return next(req);
  return next(req).pipe(
    tap({
      next: (ev) => {
        if (ev instanceof HttpResponse) done(ev.status);
      },
      error: (err: unknown) => done(err instanceof HttpErrorResponse ? err.status : 0),
    }),
  );
};
