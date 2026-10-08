import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DealsApi } from '../deals-api';

@Component({
  selector: 'app-deals-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <header class="page-head">
      <h1>Deals</h1>
      <a routerLink="/deals/new" class="button primary" data-testid="new-deal">New deal</a>
    </header>
    <table>
      <thead>
        <tr><th>Name</th><th>Currency</th><th>Desk</th><th>Status</th></tr>
      </thead>
      <tbody>
        <!-- Rows are tagged by position, not record id, so selectors survive across environments. -->
        @for (deal of deals(); track deal.id; let i = $index) {
          <tr [attr.data-testid]="'deal-row-' + i" tabindex="0" (click)="open(deal.id)" (keydown.enter)="open(deal.id)">
            <td>{{ deal.name }}</td>
            <td>{{ deal.currency }}</td>
            <td>{{ deal.desk }}</td>
            <td>{{ deal.status }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class DealsList {
  private readonly router = inject(Router);
  protected readonly deals = toSignal(inject(DealsApi).list(), { initialValue: [] });

  protected open(id: string): void {
    void this.router.navigate(['/deals', id]);
  }
}
