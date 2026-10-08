import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionRecorder } from './session-recorder.service';

/** Always visible while recording. Place once in the root component template. */
@Component({
  selector: 'rec-recorder-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-recorder-ui': '' },
  template: `
    @if (rec.active()) {
      <div class="bar" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        <span>Recording, {{ rec.stepCount() }} {{ rec.stepCount() === 1 ? 'step' : 'steps' }}</span>
        @if (rec.mode === 'support') {
          <span class="meta">Field values hidden</span>
        }
        @if (rec.skippedCount() > 0) {
          <span class="warn" title="Interactive elements without a test id were not recorded">
            {{ rec.skippedCount() }} untagged
          </span>
        }
        @if (rec.truncated()) {
          <span class="warn">Limit reached</span>
        }
        <button type="button" [attr.aria-pressed]="rec.picking()" title="Alt+Shift+A" (click)="rec.togglePicking()">
          {{ rec.picking() ? 'Click an element to check' : 'Add check' }}
        </button>
        <button type="button" (click)="rec.stopAndSave()">Stop and save</button>
        <button type="button" class="quiet" (click)="discard()">Discard</button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset-inline-start: 16px;
      inset-block-end: 16px;
      z-index: 2147483647;
      font: 13px/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      max-width: calc(100vw - 32px);
      padding: 8px 10px 8px 12px;
      color: #eef1f4;
      background: #1e2935;
      border-radius: 8px;
      box-shadow: 0 6px 20px rgb(15 23 42 / 0.35);
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #e5484d;
      animation: pulse 1.6s ease-in-out infinite;
    }
    .meta { color: #a9b4c0; }
    .warn { color: #f2c46d; }
    button {
      font: inherit;
      color: inherit;
      background: #2d3b4b;
      border: 1px solid #415166;
      border-radius: 6px;
      padding: 4px 10px;
      cursor: pointer;
    }
    button:hover { background: #384a5d; }
    button:focus-visible { outline: 2px solid #8ab4ff; outline-offset: 2px; }
    button[aria-pressed='true'] { color: #0f1b2b; background: #8ab4ff; border-color: transparent; }
    button.quiet { color: #a9b4c0; background: transparent; border-color: transparent; }
    @keyframes pulse { 50% { opacity: 0.35; } }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  `,
})
export class RecorderBadgeComponent {
  protected readonly rec = inject(SessionRecorder);

  protected discard(): void {
    if (confirm('Discard this recording? It cannot be recovered.')) this.rec.discard();
  }
}
