import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RecorderBadgeComponent } from './session-recorder';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RecorderBadgeComponent],
  template: `
    <main>
      <router-outlet />
    </main>
    <rec-recorder-badge />
  `,
})
export class App {}
