import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GenUiChatDrawerComponent, GenUiService } from 'generative-ui';
import { BankingStateService } from './core/services/banking.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, GenUiChatDrawerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly banking = inject(BankingStateService);
  protected readonly genUi = inject(GenUiService);
}
