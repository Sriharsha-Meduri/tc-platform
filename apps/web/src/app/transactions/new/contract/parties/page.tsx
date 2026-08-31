import { redirect } from 'next/navigation';

// Party confirmation is now step 5 of the contract review wizard.
export default function PartiesPage() {
  redirect('/transactions/new/contract/review');
}
