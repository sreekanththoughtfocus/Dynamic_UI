import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GenUiChatDrawerComponent, GenUiService } from 'generative-ui';
import { AuthService } from '../core/auth/auth.service';
import { BankingStateService } from '../core/services/banking.service';

@Component({
  selector: 'bank-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GenUiChatDrawerComponent],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly signingOut = signal(false);
  protected readonly displayName = computed(
    () => this.banking.currentUser()?.fullName || this.auth.user()?.fullName || 'Client',
  );
  protected readonly displayRole = computed(
    () => this.banking.currentUser()?.role || this.auth.user()?.role || 'Private Client',
  );
  protected readonly initials = computed(() => {
    const parts = this.displayName().split(' ').filter((part) => part.length > 0);
    if (parts.length === 0) return 'AP';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  });

  constructor() {
    void this.banking.refreshFromBackend();
  }

  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    await this.auth.logout();
    this.banking.currentUser.set(null);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
