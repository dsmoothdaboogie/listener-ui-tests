export interface Deal {
  id: string;
  name: string;
  currency: string;
  desk: string;
  closeDate: string | null;
  confidential: boolean;
  status: 'Draft' | 'Live';
}

export type NewDeal = Omit<Deal, 'id' | 'status'> & { counterpartyTaxId: string; approvalPin: string };
