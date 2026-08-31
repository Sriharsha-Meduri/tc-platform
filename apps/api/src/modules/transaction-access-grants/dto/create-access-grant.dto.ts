export class CreateAccessGrantDto {
  transactionId: string;
  accountEmail: string;
  accessLevel: string;
  grantedByAccountId: string;
  expiresAt?: string;
}
