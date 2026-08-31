'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthResponseDto, MeResponseDto } from '@tc/shared';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/api/v1';

export async function loginAction(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email    = formData.get('email') as string;
  const password = formData.get('password') as string;

  let data: AuthResponseDto;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Invalid email or password' };
    }

    data = await res.json() as AuthResponseDto;
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }

  const cookieStore = await cookies();
  cookieStore.set('tc_token', data.accessToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  redirect('/dashboard');
}

export async function adminLoginAction(
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const email    = formData.get('email') as string;
  const password = formData.get('password') as string;

  let data: AuthResponseDto;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Invalid email or password' };
    }

    data = await res.json() as AuthResponseDto;
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }

  if (!data.user.roles?.includes('support_admin')) {
    return { error: 'You do not have admin access. Please sign in with an admin account.' };
  }

  const cookieStore = await cookies();
  cookieStore.set('tc_token', data.accessToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/admin');
}

export async function logoutAction(formData?: FormData) {
  const cookieStore = await cookies();
  cookieStore.delete('tc_token');
  const redirectTo = formData?.get('redirectTo') as string | null;
  redirect(redirectTo ?? '/login');
}

export async function changePasswordAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!currentPassword || !newPassword) return { error: 'All fields are required' };
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters' };
  if (newPassword !== confirmPassword) return { error: 'Passwords do not match' };

  try {
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Failed to change password' };
    }

    return { success: true };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

// ─── Join brokerage ───

export async function joinBrokerageAction(organizationId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/auth/join-brokerage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ organizationId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        error: (body as { message?: string }).message ?? 'Failed to submit join request. Please try again.',
      };
    }

    return {};
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

export interface SearchOrgResult {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export async function searchOrganizationsAction(query: string): Promise<{ error?: string; orgs?: SearchOrgResult[] }> {
  try {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    const res = await fetch(`${API_URL}/organizations/search${params}`);

    if (!res.ok) {
      return { error: 'Search failed. Please try again.' };
    }

    const data = await res.json() as Array<{ id: string; name: string; city: string | null; state: string | null }>;
    return { orgs: data };
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

export interface BrowseOrgResult {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export interface BrowseResult {
  data: BrowseOrgResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function browseOrganizationsAction(page = 1, limit = 12, query?: string): Promise<{ error?: string; result?: BrowseResult }> {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query?.trim()) params.set('q', query.trim());
    const res = await fetch(`${API_URL}/organizations/browse?${params}`);
    if (!res.ok) return { error: 'Failed to load brokerages.' };
    return { result: await res.json() };
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

// ─── Invite member ───

export interface InviteMemberData {
  email: string;
  role: string;
  organizationId: string;
}

export async function inviteMemberAction(data: InviteMemberData): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/auth/invite-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Failed to send invitation. Please try again.' };
    }

    return {};
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

// ─── Account memberships (for invite flow) ───

export interface AccountMembership {
  id: string;
  organizationId: string;
  accountId: string;
  role: string;
  status: string;
  isPrimary: boolean;
}

export async function getAccountMembershipsAction(): Promise<{
  error?: string;
  memberships?: AccountMembership[];
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  const session = await getSession();
  if (!session?.account) return { error: 'No account found' };

  try {
    const res = await fetch(`${API_URL}/organization-memberships/account/${session.account.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return { error: 'Failed to load memberships' };

    const data = await res.json() as AccountMembership[];
    return { memberships: data };
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

// ─── Agent registration ───

export interface RegisterAgentData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
  dreLicenseNumber?: string;
}

export async function registerAgentAction(data: RegisterAgentData): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${API_URL}/auth/register-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Registration failed. Please try again.' };
    }

    return {};
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

// ─── Coordinator registration ───

export interface RegisterCoordinatorData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
  officePhone?: string;
}

export async function registerCoordinatorAction(data: RegisterCoordinatorData): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${API_URL}/auth/register-coordinator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Registration failed. Please try again.' };
    }

    return {};
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

// ─── Invite registration ───

export interface RegisterWithInviteData {
  token: string;
  password: string;
  firstName: string;
  lastName: string;
  cellPhone: string;
}

export async function registerWithInviteAction(data: RegisterWithInviteData): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${API_URL}/auth/register-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Registration failed. The invite may be invalid or expired.' };
    }

    return {};
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

export interface InviteInfo {
  email: string;
  organizationName: string;
}

export async function getInviteInfoAction(token: string): Promise<{ error?: string; info?: InviteInfo }> {
  try {
    const res = await fetch(`${API_URL}/auth/invite-info?token=${encodeURIComponent(token)}`);

    if (!res.ok) {
      return { error: 'Invalid or expired invitation link.' };
    }

    const info = await res.json() as InviteInfo;
    return { info };
  } catch {
    return { error: 'Unable to reach the server. Please try again.' };
  }
}

// ─── Org members (for broker management) ───

export interface OrgMember {
  id: string;
  organizationId: string;
  accountId: string;
  role: string;
  status: string;
  accessScope: string;
  isPrimary: boolean;
  joinedAt: string | null;
  createdAt: string;
  account: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    cellPhone: string | null;
    officePhone: string | null;
    avatarUrl: string | null;
    status: string;
    user: { email: string } | null;
  } | null;
}

export async function getOrgMembersAction(accountId: string): Promise<{ error?: string; members?: OrgMember[] }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/organization-memberships/my-org-members/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Failed to load members' };
    const data = await res.json() as OrgMember[];
    return { members: data };
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

export async function approveMembershipAction(membershipId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/organization-memberships/${membershipId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Failed to approve member' };
    return {};
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

export async function rejectMembershipAction(membershipId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/organization-memberships/${membershipId}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Failed to reject member' };
    return {};
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

export async function removeMemberAction(membershipId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/organization-memberships/${membershipId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Failed to remove member' };
    return {};
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

// ─── TC search & assignment ───

export interface SearchCoordinatorResult {
  id: string;
  displayName: string;
  email: string;
}

export async function searchCoordinatorsAction(query: string): Promise<{ error?: string; results?: SearchCoordinatorResult[] }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/accounts/search-coordinators?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { error: 'Search failed' };
    const data = await res.json() as SearchCoordinatorResult[];
    return { results: data };
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

export async function assignCoordinatorAction(transactionId: string, assignedCoordinatorAccountId: string | null): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  try {
    const res = await fetch(`${API_URL}/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ assignedCoordinatorAccountId }),
    });
    if (!res.ok) return { error: 'Failed to update transaction' };
    return {};
  } catch {
    return { error: 'Unable to reach the server.' };
  }
}

// ─── Profile: update display name ───

export async function updateDisplayNameAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ success?: boolean; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  const displayName = formData.get('displayName') as string;
  if (!displayName || displayName.trim().length === 0) return { error: 'Display name is required' };

  const session = await getSession();
  if (!session?.account) return { error: 'No account found' };

  try {
    const res = await fetch(`${API_URL}/accounts/${session.account.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ displayName: displayName.trim() }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Failed to update display name' };
    }

    return { success: true };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

// ─── Profile: delete account ───

export async function deleteAccountAction(): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return { error: 'Not authenticated' };

  const session = await getSession();
  if (!session?.account) return { error: 'No account found' };

  try {
    const res = await fetch(`${API_URL}/accounts/${session.account.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { message?: string }).message ?? 'Failed to delete account' };
    }

    cookieStore.delete('tc_token');
    return {};
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

export async function getSession(): Promise<MeResponseDto | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tc_token')?.value;
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<MeResponseDto>;
  } catch {
    return null;
  }
}
