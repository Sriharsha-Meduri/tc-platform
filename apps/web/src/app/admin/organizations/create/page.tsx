import { CreateOrganizationForm } from './CreateOrganizationForm';

export const metadata = { title: 'Create Organization — TC Admin' };

export default function CreateOrganizationPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Create Organization</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
        <CreateOrganizationForm />
      </div>
    </>
  );
}
