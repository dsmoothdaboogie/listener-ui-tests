import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { DealsApi } from '../deals-api';

/**
 * Exercises the recorder's hard cases: a tagged wrapper around a native input, a masked
 * section, a password field, a native select, a checkbox, CDK-overlay controls
 * (mat-select, datepicker) and one deliberately untagged button.
 */
@Component({
  selector: 'app-deal-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule],
  providers: [provideNativeDateAdapter()],
  template: `
    <h1>New deal</h1>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-form-field data-testid="deal-name">
        <mat-label>Deal name</mat-label>
        <input matInput formControlName="name" name="name" />
      </mat-form-field>

      <section data-rec-mask class="masked">
        <label data-testid="counterparty-tax-id">
          Counterparty tax id
          <input formControlName="counterpartyTaxId" name="counterpartyTaxId" />
        </label>
      </section>

      <label data-testid="approval-pin">
        Approval PIN
        <input type="password" formControlName="approvalPin" name="approvalPin" />
      </label>

      <label>
        Currency
        <select data-testid="deal-currency" formControlName="currency" name="currency">
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
        </select>
      </label>

      <mat-form-field data-testid="deal-desk">
        <mat-label>Desk</mat-label>
        <mat-select formControlName="desk">
          @for (d of desks; track d) {
            <mat-option [value]="d" [attr.data-testid]="'deal-desk-option-' + d">{{ d }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field data-testid="deal-close-date">
        <mat-label>Close date</mat-label>
        <input matInput [matDatepicker]="picker" formControlName="closeDate" name="closeDate" />
        <mat-datepicker-toggle matIconSuffix [for]="picker" data-testid="deal-close-date-toggle" />
        <mat-datepicker #picker />
      </mat-form-field>

      <label data-testid="deal-confidential" class="check">
        <input type="checkbox" formControlName="confidential" name="confidential" />
        Confidential
      </label>

      <div class="actions">
        <!-- Deliberately untagged: shows up in the badge's "untagged" count. -->
        <button type="button" class="button" (click)="helpOpen.set(!helpOpen())">Help</button>
        <button type="submit" class="button primary" data-testid="save-deal" [disabled]="saving()">Save</button>
      </div>
      @if (helpOpen()) {
        <p class="help">Deal name is required. Everything else is optional.</p>
      }
    </form>
  `,
})
export class DealForm {
  private readonly api = inject(DealsApi);
  private readonly router = inject(Router);

  protected readonly desks = ['credit', 'dcm', 'ecm'];
  protected readonly saving = signal(false);
  protected readonly helpOpen = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    counterpartyTaxId: [''],
    approvalPin: [''],
    currency: ['USD'],
    desk: ['credit'],
    closeDate: [null as Date | null],
    confidential: [false],
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const v = this.form.getRawValue();
    this.api.create({ ...v, closeDate: v.closeDate?.toISOString().slice(0, 10) ?? null }).subscribe({
      next: (deal) => void this.router.navigate(['/deals', deal.id]),
      error: () => this.saving.set(false),
    });
  }
}
