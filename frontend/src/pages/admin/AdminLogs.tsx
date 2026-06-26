import { useEffect, useMemo, useState } from 'react';
import { Search, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { formatDate } from '../../utils/format';
import PageLoader from '../../components/PageLoader';

interface LogRow {
  log_id: number;
  user_id: number | null;
  user_role: 'user' | 'admin' | 'system' | 'anonymous';
  action: string;
  status: 'success' | 'failure';
  created_at: string;
}

export default function AdminLogs() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ logs: LogRow[] }>('/admin/logs')
      .then((d) => setRows(d.logs))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    // Explicitly sort by date and time by default (newest entries first)
    const sortedRows = [...rows].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return sortedRows.filter((r) => {
      if (role !== 'all' && r.user_role !== role) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return (
        r.action.toLowerCase().includes(q) ||
        String(r.user_id || '').includes(q) ||
        String(r.log_id).includes(q)
      );
    });
  }, [rows, search, role, status]);

  if (loading) return <PageLoader />;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">Audit Logs</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, user ID, log ID…"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg">
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
            <option value="anonymous">Anonymous</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg">
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </div>
        <button onClick={() => { setSearch(''); setRole('all'); setStatus('all'); }} className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          <XCircle className="w-4 h-4" /> Clear Filters
        </button>
        <div className="mt-2 text-sm text-gray-600">Showing {filtered.length} of {rows.length} log entries</div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-700">Log ID</th>
                <th className="px-6 py-3 text-left text-gray-700">User ID</th>
                <th className="px-6 py-3 text-left text-gray-700">Role</th>
                <th className="px-6 py-3 text-left text-gray-700">Action</th>
                <th className="px-6 py-3 text-left text-gray-700">Status</th>
                <th className="px-6 py-3 text-right text-gray-700">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((r) => (
                <tr key={r.log_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800">{r.log_id}</td>
                  <td className="px-6 py-4 text-gray-600">{r.user_id ?? '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{r.user_role}</td>
                  <td className="px-6 py-4 text-gray-800">{r.action}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs ${r.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}