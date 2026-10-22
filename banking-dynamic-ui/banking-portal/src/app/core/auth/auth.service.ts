import { computed, Injectable, signal } from '@angular/core';
import { UserAccount } from '../models/banking.models';

export const SESSION_TOKEN_KEY = 'apex.session.token';
const SESSION_USER_KEY = 'apex.session.user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiBase = 'http://localhost:5050/api';
  private sessionChecked = false;

  readonly token = signal<string | null>(sessionStorage.getItem(SESSION_TOKEN_KEY));
  readonly user = signal<UserAccount | null>(this.readStoredUser());
  readonly notice = signal<string | null>(null);
  readonly isAuthenticated = computed(() => this.token() !== null && this.user() !== null);

  async login(username: string, password: string): Promise<string | null> {
    this.notice.set(null);

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      return 'The banking service is unavailable. Start the API and try again.';
    }

    if (response.status === 401) {
      return 'The username or password is incorrect.';
    }

    if (!response.ok) {
      return 'Sign-in could not be completed. Try again.';
    }

    const body = (await response.json()) as { token?: string; user?: UserAccount };
    if (!body.token || !body.user) {
      return 'Sign-in could not be completed. Try again.';
    }

    this.persist(body.token, body.user);
    this.sessionChecked = true;
    return null;
  }

  async logout(): Promise<void> {
    const token = this.token();
    this.clear();
    this.notice.set(null);
    if (!token) return;

    try {
      await fetch(`${this.apiBase}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // The browser session is already cleared.
    }
  }

  async ensureSession(): Promise<boolean> {
    const token = this.token();
    if (!token || !this.user()) {
      if (token || sessionStorage.getItem(SESSION_USER_KEY)) {
        this.clear();
      }
      return false;
    }

    if (this.sessionChecked) return true;

    try {
      const response = await fetch(`${this.apiBase}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        this.expireSession();
        return false;
      }

      if (!response.ok) return true;

      const user = (await response.json()) as UserAccount;
      this.persist(token, user);
      this.sessionChecked = true;
      return true;
    } catch {
      return true;
    }
  }

  expireSession(): void {
    this.clear();
    this.notice.set('Your session expired. Sign in again.');
  }

  private persist(token: string, user: UserAccount): void {
    const safeUser: UserAccount = { ...user, password: undefined };
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(safeUser));
    this.token.set(token);
    this.user.set(safeUser);
  }

  private clear(): void {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    this.token.set(null);
    this.user.set(null);
    this.sessionChecked = false;
  }

  private readStoredUser(): UserAccount | null {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as UserAccount;
      if (!parsed?.id || !parsed.username) return null;
      return { ...parsed, password: undefined };
    } catch {
      return null;
    }
  }
}
