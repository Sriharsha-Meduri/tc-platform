'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000') + '/admin/api';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function authedFetch(path: string, init?: RequestInit) {
  const token = (await cookies()).get('tc_token')?.value;
  if (!token) redirect('/admin-login');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...authHeaders(token), ...init?.headers } });
  if (res.status === 401 || res.status === 403) redirect('/admin-login');
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
  return res.json();
}

export interface AdminStats {
  totalUsers: number;
  pendingUsers: number;
  totalOrganizations: number;
  pendingOrganizations: number;
}

export async function getAdminStatsAction(): Promise<AdminStats> {
  return authedFetch('/stats');
}

export async function getAdminUsersAction() {
  return authedFetch('/users');
}

export interface AdminUser {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  roles: string[];
  status: string;
  emailVerifiedAt: string | null;
  verificationToken: boolean;
  createdAt: string;
  account: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    status: string;
  } | null;
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    status: string;
    isPrimary: boolean;
    organization: { id: string; name: string; status: string } | null;
  }>;
}

export async function getAdminOrganizationsAction() {
  return authedFetch('/organizations');
}

export async function approveOrganizationAction(id: string) {
  const result = await authedFetch(`/organizations/${id}/approve`, { method: 'POST' });
  revalidatePath('/admin/organizations');
  return result;
}

export async function rejectOrganizationAction(id: string) {
  const result = await authedFetch(`/organizations/${id}/reject`, { method: 'POST' });
  revalidatePath('/admin/organizations');
  return result;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  accountId: string | null;
  createdAt: string;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function updateUserStatusAction(id: string, status: string) {
  const result = await authedFetch(`/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/admin/users');
  return result;
}

export async function updateUserAction(
  id: string,
  data: {
    email?: string;
    phone?: string | null;
    role?: string;
    status?: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
  },
) {
  const result = await authedFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  revalidatePath('/admin/users');
  return result;
}

export async function resendVerificationAction(id: string, email?: string) {
  return authedFetch(`/users/${id}/resend-verification`, {
    method: 'POST',
    body: JSON.stringify(email ? { email } : {}),
  });
}

export async function assignBrokerageAction(id: string, organizationId: string, role: string) {
  const result = await authedFetch(`/users/${id}/assign-brokerage`, {
    method: 'POST',
    body: JSON.stringify({ organizationId, role }),
  });
  revalidatePath('/admin/users');
  return result;
}

export async function searchOrganizationsAction(query: string) {
  if (!query || query.length < 2) return [];
  return authedFetch(`/organizations?q=${encodeURIComponent(query)}`);
}

export interface CreateOrganizationData {
  name: string;
  type: string;
  licenseNumber?: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPhone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export async function createOrganizationAction(data: CreateOrganizationData) {
  const token = (await cookies()).get('tc_token')?.value;
  if (!token) redirect('/admin-login');

  const res = await fetch(`${API_URL}/organizations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });

  if (res.status === 401 || res.status === 403) redirect('/admin-login');

  const json = await res.json();

  if (!res.ok) {
    return { success: false as const, error: json.message ?? 'An error occurred' };
  }

  revalidatePath('/admin/organizations');
  return { success: true as const, inviteUrl: json.inviteUrl, organization: json.organization };
}

export async function deleteUserAction(id: string) {
  const token = (await cookies()).get('tc_token')?.value;
  if (!token) redirect('/admin-login');
  const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { error: 'Failed to delete user' };
  revalidatePath('/admin/users');
  return { success: true };
}
