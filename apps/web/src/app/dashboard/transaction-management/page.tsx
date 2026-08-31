import { api } from '@/lib/api';
import TransactionManagementClient from './TransactionManagementClient';

export const dynamic = 'force-dynamic';

export default async function TransactionManagementPage() {
  const [transactions, grants, agentParties] = await Promise.all([
    api.transactions.list(),
    api.accessGrants.list(),
    api.agentsAndCoordinators.list(),
  ]);

  return (
    <TransactionManagementClient
      transactions={transactions ?? []}
      grants={grants ?? []}
      agentParties={agentParties ?? []}
    />
  );
}
