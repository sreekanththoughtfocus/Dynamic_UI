import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'bank-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const notice = this.auth.notice();
    if (notice) {
      this.error.set(notice);
      this.auth.notice.set(null);
    }
  }

  protected onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected useDemoClient(): void {
    this.username.set('alex.vance');
    this.password.set('ApexSecure2026!');
    this.error.set(null);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.submitting()) return;

    const username = this.username().trim();
    const password = this.password();
    if (!username || !password) {
      this.error.set('Enter your username and password.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const message = await this.auth.login(username, password);
    this.submitting.set(false);

    if (message) {
      this.error.set(message);
      return;
    }

    await this.router.navigateByUrl('/dashboard');
  }
}
