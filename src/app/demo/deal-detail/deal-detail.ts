import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { DealsApi } from '../deals-api';

@Component({
  selector: 'app-deal-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="page-head">
      <h1>Deal</h1>
      <a routerLink="/deals" class="button" data-testid="back-to-deals">All deals</a>
    </header>
    @if (deal(); as d) {
      <dl>
        <dt>Name</dt><dd data-testid="deal-name-display">{{ d.name }}</dd>
        <dt>Currency</dt><dd data-testid="deal-currency-display">{{ d.currency }}</dd>
        <dt>Desk</dt><dd data-testid="deal-desk-display">{{ d.desk }}</dd>
        <dt>Status</dt><dd data-testid="deal-status">{{ d.status }}</dd>
      </dl>
    } @else {
      <p>Loading…</p>
    }
  `,
})
export class DealDetail {
  /** Bound from the :id route param (withComponentInputBinding). */
  readonly id = input.required<string>();
  private readonly api = inject(DealsApi);
  protected readonly deal = toSignal(toObservable(this.id).pipe(switchMap((id) => this.api.get(id))));
}
