import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Deal, NewDeal } from './deal.model';

@Injectable({ providedIn: 'root' })
export class DealsApi {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Deal[]>('/api/deals');
  }

  get(id: string) {
    return this.http.get<Deal>(`/api/deals/${id}`);
  }

  create(deal: NewDeal) {
    return this.http.post<Deal>('/api/deals', deal);
  }
}
