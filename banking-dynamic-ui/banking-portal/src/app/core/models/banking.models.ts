export interface BankAccount {
  id: string;
  accountNumber: string;
  accountType: string;
  currency: string;
  balance: number;
  availableBalance: number;
  ownerName: string;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: 'Debit' | 'Credit';
  status: string;
}

export interface BankCard {
  id: string;
  cardNumberMasked: string;
  cardType: 'Credit' | 'Debit';
  cardName: string;
  expiryDate: string;
  isFrozen: boolean;
  spendingLimit: number;
  currentBalance: number;
  colorScheme: string;
  pin?: string;
}

export interface SecurityProfile {
  username: string;
  email: string;
  twoFactorEnabled: boolean;
  biometricsEnabled: boolean;
  lastPasswordChange: string;
  activeSessionsCount: number;
}

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  email: string;
  password?: string;
  phoneNumber: string;
  address: string;
  twoFactorEnabled: boolean;
  biometricsEnabled: boolean;
  role: string;
  lastLoginAt?: string;
  lastPasswordResetAt?: string;
}

export interface AiAuditLogItem {
  id: string;
  timestamp: string;
  action: string;
  initiator: string;
  details: string;
}

export interface DatabaseOverview {
  users: UserAccount[];
  accounts: BankAccount[];
  cards: BankCard[];
  transactions: BankTransaction[];
  auditLogs: AiAuditLogItem[];
  timestamp: string;
  databaseProvider: string;
  totalRecordsCount: number;
}
