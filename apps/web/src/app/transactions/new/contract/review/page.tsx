import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import ContractReview from './ContractReview';

export const metadata = { title: 'Review Extracted Contract — TC' };

export default async function ContractReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { duplicate } = await searchParams;
  const isAgent = session.user.roles?.includes('agent') ?? false;

  return (
    <ContractReview
      isDuplicate={duplicate === '1'}
      isAgent={isAgent}
      agentAccount={
        isAgent && session.account
          ? {
              displayName: session.account.displayName,
              firstName: session.account.firstName,
              lastName: session.account.lastName,
              email: session.user.email,
            }
          : null
      }
    />
  );
}
