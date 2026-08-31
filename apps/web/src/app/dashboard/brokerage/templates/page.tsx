import { api } from '@/lib/api';
import FormTemplatesPageClient from '../../utils/form-templates/FormTemplatesPageClient';

export const dynamic = 'force-dynamic';

export default async function BrokerageTemplatesPage() {
  // Broker admin's own org scopes both the template list and manage permission.
  let organizationId: string | null = null;
  let canManageTemplates = false;
  let isSupportAdmin = false;
  const me = await api.auth.me();
  const meAccount = me?.account;
  if (me) {
    isSupportAdmin = (me.user.roles ?? []).includes('support_admin');
  }
  if (meAccount) {
    const members = await api.members.myOrgMembers(meAccount.id);
    const ownMembership = members?.find((m) => m.accountId === meAccount.id);
    if (ownMembership?.role === 'broker_admin') {
      canManageTemplates = true;
      organizationId = ownMembership.organizationId;
    }
  }

  const orgTemplates = await api.formTemplates.list({ organizationId: organizationId ?? undefined, stateCode: 'CA' });

  return (
    <FormTemplatesPageClient
      orgTemplates={orgTemplates ?? []}
      canManageTemplates={canManageTemplates}
      organizationId={organizationId}
      isSupportAdmin={isSupportAdmin}
    />
  );
}
