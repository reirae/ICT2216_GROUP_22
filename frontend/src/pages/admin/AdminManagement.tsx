import { useEffect, useMemo, useState } from 'react';
import { Search, XCircle, Filter } from 'lucide-react';
import { api } from '../../api/client';
import PageLoader from '../../components/PageLoader';

interface AdminAccount {
  admin_id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  role: 'business_admin' | 'it_admin' | 'admin';
  otp_enabled: number;
  created_at: string;
}

export default function AdminManagement() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAdmins = () =>
    api.get<{ admins: AdminAccount[] }>('/admin/list-admins') // Assuming this endpoint exists or is handled by your backend routing
      .then((d) => setAdmins(d.admins))
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadAdmins().finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return admins.filter((a) => {
      const matchRole = roleFilter === 'all' || a.role === roleFilter;
      if (!matchRole) return false;
      if (!q) return true;
      return (
        a.username.toLowerCase().includes(q) ||
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        String(a.admin_id).includes(q)
      );
    });
  }, [admins, search, roleFilter]);

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
        <h1 className="text-2xl sm:text-3xl text-gray-800">Administrator Directory</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Filter Matrix Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          <h3 className="text-base sm:text-lg text-gray-800">Filter Administrative Personnel</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, email, ID…"
              className="w-full pl-10 pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Administrative Roles</option>
            <option value="business_admin">Business Admin</option>
            <option value="it_admin">IT Admin</option>
          </select>
          <button
            onClick={() => { setSearch(''); setRoleFilter('all'); }}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm sm:text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <XCircle className="w-4 h-4" /> Clear Filters
          </button>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-gray-600">
          Showing {filtered.length} of {admins.length} administrative profiles
        </div>
      </div>

      {/* Desktop Structural Table Layout */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-700">Admin ID</th>
                <th className="px-6 py-3 text-left text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-gray-700">Username</th>
                <th className="px-6 py-3 text-left text-gray-700">Email Address</th>
                <th className="px-6 py-3 text-left text-gray-700">Phone Number</th>
                <th className="px-6 py-3 text-left text-gray-700">Classification Role</th>
                <th className="px-6 py-3 text-left text-gray-700">2FA Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((a) => (
                <tr key={a.admin_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800 font-mono text-sm">{a.admin_id}</td>
                  <td className="px-6 py-4 text-gray-800">{a.first_name} {a.last_name}</td>
                  <td className="px-6 py-4 text-gray-600 font-medium">@{a.username}</td>
                  <td className="px-6 py-4 text-gray-600">{a.email}</td>
                  <td className="px-6 py-4 text-gray-600">{a.phone_number || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase ${
                      a.role === 'it_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {a.role === 'it_admin' ? 'IT Admin' : 'Business Admin'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs ${
                      a.otp_enabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {a.otp_enabled ? 'Enforced' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Responsive Layout Card Shells */}
      <div className="lg:hidden space-y-4">
        {filtered.map((a) => (
          <div key={a.admin_id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-xs text-gray-400 block mb-0.5">ID: {a.admin_id}</span>
                <p className="font-medium text-gray-800">{a.first_name} {a.last_name}</p>
                <p className="text-sm text-gray-600">@{a.username}</p>
              </div>
              <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase ${
                a.role === 'it_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>{a.role === 'it_admin' ? 'IT' : 'Business'}</span>
            </div>
            <div className="space-y-1 text-sm border-t border-gray-100 pt-2 mt-2">
              <p className="text-gray-600"><span className="text-gray-400">Email:</span> {a.email}</p>
              <p className="text-gray-600"><span className="text-gray-400">Phone:</span> {a.phone_number || '—'}</p>
              <p className="text-xs mt-2">
                <span className="text-gray-400">2FA Verification Mode:</span>{' '}
                <span className={a.otp_enabled ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                  {a.otp_enabled ? 'Enforced' : 'Disabled'}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}