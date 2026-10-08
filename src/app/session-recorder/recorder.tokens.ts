import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type { RecorderMode } from './recorder.model';

/** Runs in an injection context, so it can inject your auth/entitlement services. */
export type RecorderEntitlement = () => boolean | Promise<boolean> | Observable<boolean>;

export interface SessionRecorderConfig {
  /**
   * 'support' unless the build explicitly opts in to 'test'.
   * Leaving it unset fails closed: no field values are ever captured.
   */
  mode?: RecorderMode;
  /** The data attribute your tagging skill writes. Default 'data-testid'. */
  attribute?: string;
  /** Query parameter that turns recording on (?rec=on) or off (?rec=off). Default 'rec'. */
  queryParam?: string;
  appVersion: string;
  environment: string;
  /** Who may record. Checked on start and again after every reload. */
  canRecord: RecorderEntitlement;
  /** Test mode: target ids whose values are never captured, on top of the built-in rules. */
  alwaysMask?: readonly string[];
  /** Support mode: target ids whose values MAY be captured. Needs security sign-off; keep empty by default. */
  supportValueAllowList?: readonly string[];
  /** Requests to leave out of wait correlation: telemetry, heartbeats, polling. */
  ignoreRequests?: readonly (string | RegExp)[];
  /** Hard cap per session. Default 2000. */
  maxEvents?: number;
}

export type ResolvedRecorderConfig = Readonly<Required<SessionRecorderConfig>>;

export const RECORDER_CONFIG = new InjectionToken<ResolvedRecorderConfig>('SESSION_RECORDER_CONFIG');

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/;

export function resolveRecorderConfig(c: SessionRecorderConfig): ResolvedRecorderConfig {
  const attribute = c.attribute ?? 'data-testid';
  if (!ATTRIBUTE_NAME.test(attribute)) {
    throw new Error(`[session-recorder] invalid attribute name "${attribute}"`);
  }
  // Listed field by field so a stray spread can never override the fail-closed default.
  return Object.freeze({
    mode: c.mode ?? 'support',
    attribute,
    queryParam: c.queryParam ?? 'rec',
    appVersion: c.appVersion,
    environment: c.environment,
    canRecord: c.canRecord,
    alwaysMask: c.alwaysMask ?? [],
    supportValueAllowList: c.supportValueAllowList ?? [],
    ignoreRequests: c.ignoreRequests ?? [],
    maxEvents: c.maxEvents ?? 2000,
  });
}
