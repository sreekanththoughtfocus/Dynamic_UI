import { effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  BankAccount,
  BankCard,
  BankTransaction,
  SecurityProfile,
  UserAccount,
  DatabaseOverview,
} from '../models/banking.models';
import {
  PropertyDocument,
  PropertyDocumentSummary,
  PropertySaveResult,
} from '../models/property-document.model';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root',
})
export class BankingStateService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly apiBase = 'http://localhost:5050/api';

  public readonly currentUser = signal<UserAccount | null>(this.auth.user());

  constructor() {
    effect(() => {
      this.currentUser.set(this.auth.user());
    });
  }

  // Signals
  public readonly accounts = signal<BankAccount[]>([
    {
      id: 'acc-chk-01',
      accountNumber: 'CHK-98214-01',
      accountType: 'Premier Checking',
      balance: 24890.75,
      availableBalance: 24390.75,
      currency: 'USD',
      ownerName: 'Alex Vance',
    },
    {
      id: 'acc-sav-02',
      accountNumber: 'SAV-33108-02',
      accountType: 'High-Yield Savings (4.75% APY)',
      balance: 78250.0,
      availableBalance: 78250.0,
      currency: 'USD',
      ownerName: 'Alex Vance',
    },
    {
      id: 'acc-inv-03',
      accountNumber: 'INV-55091-03',
      accountType: 'Global Wealth Portfolio',
      balance: 142600.4,
      availableBalance: 142600.4,
      currency: 'USD',
      ownerName: 'Alex Vance',
    },
  ]);

  public readonly selectedAccountId = signal<string>('acc-chk-01');

  public readonly cards = signal<BankCard[]>([
    {
      id: 'card-crd-01',
      cardNumberMasked: '•••• •••• •••• 8821',
      cardType: 'Credit',
      cardName: 'Apex Black Diamond Elite',
      expiryDate: '11/29',
      isFrozen: false,
      spendingLimit: 25000,
      currentBalance: 4120.3,
      colorScheme: 'diamond-dark',
    },
    {
      id: 'card-deb-02',
      cardNumberMasked: '•••• •••• •••• 3419',
      cardType: 'Debit',
      cardName: 'Apex Premier Debit Platinum',
      expiryDate: '05/28',
      isFrozen: false,
      spendingLimit: 5000,
      currentBalance: 0,
      colorScheme: 'emerald-cyan',
    },
  ]);

  public readonly transactions = signal<BankTransaction[]>([
    {
      id: 'tx-101',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 3 * 3600000).toISOString(),
      description: 'Amazon Web Services Cloud Infrastructure',
      category: 'Cloud & Tech',
      amount: -342.5,
      type: 'Debit',
      status: 'Posted',
    },
    {
      id: 'tx-102',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 24 * 3600000).toISOString(),
      description: 'Whole Foods Organic Market',
      category: 'Groceries',
      amount: -185.2,
      type: 'Debit',
      status: 'Posted',
    },
    {
      id: 'tx-103',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 48 * 3600000).toISOString(),
      description: 'Payroll Direct Deposit - TechForward Corp',
      category: 'Income',
      amount: 6450.0,
      type: 'Credit',
      status: 'Posted',
    },
    {
      id: 'tx-104',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 72 * 3600000).toISOString(),
      description: 'Starbucks Reserve Roastery',
      category: 'Dining',
      amount: -14.8,
      type: 'Debit',
      status: 'Posted',
    },
    {
      id: 'tx-105',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 96 * 3600000).toISOString(),
      description: 'Equinox Luxury Fitness Club',
      category: 'Health & Wellness',
      amount: -280.0,
      type: 'Debit',
      status: 'Posted',
    },
    {
      id: 'tx-106',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 120 * 3600000).toISOString(),
      description: 'Delta Airlines Premium Transatlantic',
      category: 'Travel',
      amount: -1240.0,
      type: 'Debit',
      status: 'Posted',
    },
    {
      id: 'tx-107',
      accountId: 'acc-chk-01',
      date: new Date(Date.now() - 144 * 3600000).toISOString(),
      description: 'Apple Store Online - MacBook Pro M4',
      category: 'Electronics',
      amount: -2499.0,
      type: 'Debit',
      status: 'Posted',
    },
  ]);

  public readonly securityProfile = signal<SecurityProfile>({
    username: 'alex.vance',
    email: 'a.vance@example.com',
    twoFactorEnabled: true,
    biometricsEnabled: true,
    lastPasswordChange: '2 weeks ago',
    activeSessionsCount: 2,
  });

  public readonly notification = signal<string | null>(null);
  public readonly insights = signal<InsightFeed | null>(null);
  private readonly limitTimers = new Map<string, number>();

  public showToast(message: string): void {
    this.notification.set(message);
    setTimeout(() => {
      if (this.notification() === message) {
        this.notification.set(null);
      }
    }, 4500);
  }

  private async readError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) return body.message;
    } catch {
      // The response was not JSON.
    }
    return 'The property document was not saved.';
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const tokenAtSend = this.auth.token();
    if (tokenAtSend) {
      headers.set('Authorization', `Bearer ${tokenAtSend}`);
    }

    const response = await fetch(`${this.apiBase}${path}`, { ...init, headers });
    if (response.status === 401 && tokenAtSend && this.auth.token() === tokenAtSend) {
      this.auth.expireSession();
      if (!this.router.url.startsWith('/login')) {
        void this.router.navigateByUrl('/login');
      }
    }
    return response;
  }

  public async refreshFromBackend(): Promise<void> {
    const tokenAtStart = this.auth.token();
    try {
      const [user, accounts, cards, transactions] = await Promise.all([
        this.api('/user-profile').then((r) => (r.ok ? r.json() : null)),
        this.api('/accounts').then((r) => (r.ok ? r.json() : null)),
        this.api('/cards').then((r) => (r.ok ? r.json() : null)),
        this.api('/transactions?limit=40').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (this.auth.token() !== tokenAtStart) return;

      if (user) {
        const safeUser: UserAccount = { ...user, password: undefined };
        this.currentUser.set(safeUser);
        this.securityProfile.update((p) => ({
          ...p,
          username: safeUser.username,
          email: safeUser.email,
          twoFactorEnabled: safeUser.twoFactorEnabled,
          biometricsEnabled: safeUser.biometricsEnabled,
          lastPasswordChange: safeUser.lastPasswordResetAt
            ? new Date(safeUser.lastPasswordResetAt).toLocaleDateString()
            : p.lastPasswordChange,
        }));
      }
      if (accounts) this.accounts.set(accounts);
      if (cards) this.cards.set(cards);
      if (transactions) this.transactions.set(transactions);
      void this.loadInsights();
    } catch {
      // Offline fallback state
    }
  }

  public async getDatabaseOverview(): Promise<DatabaseOverview | null> {
    try {
      const res = await this.api(`/admin/overview`);
      if (res.ok) {
        return (await res.json()) as DatabaseOverview;
      }
    } catch (err) {
      console.error('Failed to fetch admin overview', err);
    }
    return null;
  }

  public async updateAdminUser(user: UserAccount): Promise<boolean> {
    try {
      const res = await this.api(`/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      if (res.ok) {
        this.currentUser.set(user);
        this.showToast(`✅ Admin: Updated user credentials for ${user.username} (Password saved in DB).`);
        return true;
      }
    } catch {
      // Continue
    }
    return false;
  }

  public async resetDatabase(): Promise<boolean> {
    try {
      const res = await this.api(`/admin/reset-db`, {
        method: 'POST',
      });
      if (res.ok) {
        await this.refreshFromBackend();
        this.showToast('♻️ EF Core SQLite database wiped & re-seeded to initial state.');
        return true;
      }
    } catch {
      // Continue
    }
    return false;
  }

  public async listPropertyDocuments(): Promise<PropertyDocumentSummary[] | null> {
    try {
      const res = await this.api('/admin/property-documents');
      if (!res.ok) return null;
      return (await res.json()) as PropertyDocumentSummary[];
    } catch {
      return null;
    }
  }

  public async getPropertyDocument(id: string): Promise<PropertyDocument | null> {
    try {
      const res = await this.api(`/admin/property-documents/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return (await res.json()) as PropertyDocument;
    } catch {
      return null;
    }
  }

  public async savePropertyDocument(doc: PropertyDocument): Promise<PropertySaveResult> {
    try {
      const res = await this.api(`/admin/property-documents/${encodeURIComponent(doc.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: doc.name,
          tree: doc.tree,
          values: doc.values,
        }),
      });
      if (!res.ok) {
        return { document: null, error: await this.readError(res) };
      }
      return { document: (await res.json()) as PropertyDocument, error: null };
    } catch {
      return { document: null, error: 'The property service is unreachable.' };
    }
  }

  public async createAdminTransaction(tx: Partial<BankTransaction>): Promise<boolean> {
    try {
      const res = await this.api(`/admin/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      if (res.ok) {
        await this.refreshFromBackend();
        this.showToast(`💵 Admin: Created test transaction "${tx.description}".`);
        return true;
      }
    } catch {
      // Continue
    }
    return false;
  }

  public async resetCardPin(cardId: string, newPin: string): Promise<boolean> {
    try {
      const res = await this.api(`/cards/${cardId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, newPin }),
      });
      if (!res.ok) {
        this.showToast('PIN was not updated.');
        return false;
      }
    } catch {
      this.showToast('PIN was not updated.');
      return false;
    }

    const card = this.cards().find((c) => c.id === cardId);
    this.showToast(
      `PIN updated for ${card ? card.cardName : 'card'}.`,
    );
    return true;
  }

  public async setCardFreeze(cardId: string, freeze: boolean): Promise<boolean> {
    try {
      const res = await this.api(`/cards/${cardId}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, freeze }),
      });
      if (!res.ok) {
        this.showToast('Card status was not changed.');
        return false;
      }
    } catch {
      this.showToast('Card status was not changed.');
      return false;
    }

    this.cards.update((cards) =>
      cards.map((c) => (c.id === cardId ? { ...c, isFrozen: freeze } : c)),
    );

    const card = this.cards().find((c) => c.id === cardId);
    this.showToast(
      `${card ? card.cardName : 'Card'} is now ${freeze ? 'frozen' : 'active'}.`,
    );
    return true;
  }

  public updateCardLimit(cardId: string, limit: number): void {
    this.cards.update((cards) =>
      cards.map((c) => (c.id === cardId ? { ...c, spendingLimit: limit } : c)),
    );
    const pending = this.limitTimers.get(cardId);
    if (pending) window.clearTimeout(pending);
    this.limitTimers.set(
      cardId,
      window.setTimeout(() => {
        void this.postCardLimit(cardId, limit);
      }, 400),
    );
  }

  private async postCardLimit(cardId: string, limit: number): Promise<void> {
    try {
      const res = await this.api(`/cards/${cardId}/limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      if (!res.ok) {
        this.showToast('Spending limit was not saved.');
        return;
      }
      this.showToast(`Spending limit saved at $${limit.toLocaleString()}.`);
    } catch {
      this.showToast('Spending limit was not saved.');
    }
  }

  public async loadInsights(): Promise<void> {
    try {
      const res = await this.api('/insights');
      if (res.ok) this.insights.set((await res.json()) as InsightFeed);
    } catch {
      this.insights.set(null);
    }
  }

  public async fileDispute(transactionId: string, reason: string): Promise<{ id: string } | null> {
    try {
      const res = await this.api('/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, reason }),
      });
      if (!res.ok) return null;
      const filed = (await res.json()) as { id: string };
      this.showToast(`Dispute ${filed.id} is open.`);
      return filed;
    } catch {
      return null;
    }
  }

  public async fileTravelNotice(notice: TravelNoticeRequest): Promise<boolean> {
    try {
      const res = await this.api('/travel-notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notice),
      });
      if (!res.ok) {
        this.showToast('Travel notice was not saved.');
        return false;
      }
      await this.refreshFromBackend();
      this.showToast(`Travel notice saved for ${notice.destination}.`);
      return true;
    } catch {
      this.showToast('Travel notice was not saved.');
      return false;
    }
  }

  public async lockFxRate(from: string, to: string, amount: number): Promise<FxLockResult | null> {
    try {
      const res = await this.api('/fx/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, amount }),
      });
      if (!res.ok) return null;
      return (await res.json()) as FxLockResult;
    } catch {
      return null;
    }
  }

  public async loadFxRates(): Promise<FxRateTable | null> {
    try {
      const res = await this.api('/fx/rates');
      if (!res.ok) return null;
      return (await res.json()) as FxRateTable;
    } catch {
      return null;
    }
  }

  public async resetPassword(newPassword: string): Promise<boolean> {
    try {
      const res = await this.api(`/security/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        this.showToast('Password was not updated.');
        return false;
      }
    } catch {
      this.showToast('Password was not updated.');
      return false;
    }
    this.securityProfile.update((p) => ({
      ...p,
      lastPasswordChange: 'Just now',
    }));
    this.showToast('Online banking password was updated.');
    return true;
  }

  public async transferFunds(
    fromAccountId: string,
    recipient: string,
    amount: number,
    note: string,
  ): Promise<boolean> {
    const acc = this.accounts().find((a) => a.id === fromAccountId);
    if (!acc || acc.availableBalance < amount) {
      this.showToast(`❌ Transfer failed: Insufficient funds.`);
      return false;
    }

    try {
      const res = await this.api(`/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          toAccountOrRecipient: recipient,
          amount,
          note,
        }),
      });
      if (!res.ok) {
        this.showToast('Transfer was not posted. Check the available balance.');
        return false;
      }
      await this.refreshFromBackend();
    } catch {
      this.showToast('Transfer was not posted.');
      return false;
    }

    this.showToast(
      `Transferred $${amount.toFixed(2)} to ${recipient}.`,
    );
    return true;
  }
}

export interface InsightChip {
  label: string;
  prompt: string;
}

export interface InsightFeed {
  netWorth: number;
  monthNetChange: number;
  projectedCheckingEnd: number;
  checkingAccountId: string;
  chips: InsightChip[];
}

export interface TravelNoticeRequest {
  destination: string;
  cardId: string;
  startDate: string;
  endDate: string;
  temporaryLimit: number;
}

export interface FxRateTable {
  asOf: string;
  source: string;
  perUsd: Record<string, number>;
}

export interface FxLockResult {
  from: string;
  to: string;
  amount: number;
  rate: number;
  converted: number;
  asOf: string;
  source: string;
}
