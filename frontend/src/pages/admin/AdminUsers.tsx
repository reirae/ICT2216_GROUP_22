import { useEffect, useMemo, useState } from 'react';
import { Search, XCircle, Filter, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { PATTERNS, formatMoney } from '../../utils/format';
import PageLoader from '../../components/PageLoader';

interface AdminUser {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  account_number: string;
  balance: string;
  status: 'active' | 'suspended' | 'deactivated';
}

const blank = { first_name: '', last_name: '', email: '', phone_number: '', username: '', password: '' };

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () =>
    api.get<{ users: AdminUser[] }>('/admin/users')
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));

  // Spinner only on the initial load; later refreshes keep the table visible.
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.account_number.includes(q) ||
        String(u.user_id).includes(q)
      );
    });
  }, [users, search, statusFilter]);

  const setStatus = async (id: number, status: AdminUser['status']) => {
    try { await api.put(`/admin/users/${id}/status`, { status }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!PATTERNS.name.test(form.first_name) || !PATTERNS.name.test(form.last_name))
      return setFormError('Invalid name.');
    if (!PATTERNS.email.test(form.email)) return setFormError('Invalid email.');
    if (form.phone_number && !PATTERNS.phone.test(form.phone_number))
      return setFormError('Invalid phone.');
    if (!PATTERNS.username.test(form.username)) return setFormError('Invalid username.');
    if (!PATTERNS.password.test(form.password)) return setFormError('Weak password.');
    try {
      await api.post('/admin/users', {
        ...form,
        phone_number: form.phone_number || undefined,
      });
      setShowAdd(false);
      setForm({ ...blank });
      await load();
    } catch (e: any) {
      setFormError(e.message);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
        <h1 className="text-2xl sm:text-3xl text-gray-800">User Management</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {showAdd && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
          <h3 className="text-lg text-gray-800 mb-4">Create User</h3>
          <form onSubmit={submitCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={50} />
            <input placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={50} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={100} />
            <input placeholder="Phone (optional)" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={20} />
            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={50} />
            <input type="password" placeholder="Initial password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-4 py-2 border rounded-lg" maxLength={128} />
            {formError && <div className="md:col-span-2 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{formError}</div>}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Create</button>
              <button type="button" onClick={() => { setShowAdd(false); setFormError(''); }} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          <h3 className="text-base sm:text-lg text-gray-800">Filter Users</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, email, account…"
              className="w-full pl-10 pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm sm:text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <XCircle className="w-4 h-4" /> Clear Filters
          </button>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-gray-600">
          Showing {filtered.length} of {users.length} users
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-700">Account No.</th>
                <th className="px-6 py-3 text-left text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-gray-700">Username</th>
                <th className="px-6 py-3 text-left text-gray-700">Email</th>
                <th className="px-6 py-3 text-left text-gray-700">Balance</th>
                <th className="px-6 py-3 text-left text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((u) => (
                <tr key={u.user_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-gray-600">{u.account_number}</td>
                  <td className="px-6 py-4 text-gray-800">{u.first_name} {u.last_name}</td>
                  <td className="px-6 py-4 text-gray-600">{u.username}</td>
                  <td className="px-6 py-4 text-gray-600">{u.email}</td>
                  <td className="px-6 py-4 text-gray-800">{formatMoney(u.balance)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs ${
                      u.status === 'active' ? 'bg-green-100 text-green-700' :
                      u.status === 'suspended' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    }`}>{u.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={u.status}
                      onChange={(e) => setStatus(u.user_id, e.target.value as AdminUser['status'])}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="deactivated">Deactivated</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden space-y-4">
        {filtered.map((u) => (
          <div key={u.user_id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-mono text-blue-600 font-bold">Acc: {u.account_number}</p>
                <p className="font-medium text-gray-800 mt-0.5">{u.first_name} {u.last_name}</p>
                <p className="text-sm text-gray-600">@{u.username}</p>
              </div>
              <span className={`inline-flex px-2 py-1 rounded text-xs ${
                u.status === 'active' ? 'bg-green-100 text-green-700' :
                u.status === 'suspended' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
              }`}>{u.status}</span>
            </div>
            <div className="space-y-1 text-sm mb-3">
              <p className="text-gray-600">{u.email}</p>
              <p className="font-medium text-gray-800">Balance: {formatMoney(u.balance)}</p>
            </div>
            <label className="block text-xs text-gray-600 mb-1">Change Status</label>
            <select
              value={u.status}
              onChange={(e) => setStatus(u.user_id, e.target.value as AdminUser['status'])}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deactivated">Deactivated</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}