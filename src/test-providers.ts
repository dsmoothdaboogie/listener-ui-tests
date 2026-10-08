import { provideZonelessChangeDetection } from '@angular/core';

/** Applied to every TestBed by the Angular unit-test builder. Matches the app: zoneless. */
export default [provideZonelessChangeDetection()];
