import { getAdminStatsAction } from '@/lib/admin-actions';

export const metadata = { title: 'Admin Dashboard — TC' };

export default async function AdminDashboardPage() {
  const stats = await getAdminStatsAction();

  const cards = [
    { label: 'Total Users',         value: stats.totalUsers,         color: 'text-blue-600' },
    { label: 'Pending Users',       value: stats.pendingUsers,       color: 'text-amber-600' },
    { label: 'Organizations',       value: stats.totalOrganizations, color: 'text-green-600' },
    { label: 'Pending Approval',    value: stats.pendingOrganizations, color: 'text-purple-600' },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
