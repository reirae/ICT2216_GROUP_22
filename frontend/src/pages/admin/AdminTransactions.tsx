import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { formatDate, formatMoney } from '../../utils/format';

interface AdminTxn {
  transaction_id: number;
  user_id: number;
  recipient_id: number | null;
  type: 'debit' | 'credit';
  amount: string;
  description: string | null;
  created_at: string;
  user_name: string | null;
  user_account: string | null;
  recipient_name: string | null;
}

export default function AdminTransactions() {
  const [txns, setTxns] = useState<AdminTxn[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'debit' | 'credit'>('all');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ transactions: AdminTxn[] }>('/admin/transactions')
      .then((d) => setTxns(d.transactions))
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (userId && String(t.user_id) !== userId.trim()) return false;
      if (dateFrom && t.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && t.created_at.slice(0, 10) > dateTo) return false;
      const amt = Number(t.amount);
      if (min && amt < Number(min)) return false;
      if (max && amt > Number(max)) return false;
      if (!q) return true;
      return (
        (t.description || '').toLowerCase().includes(q) ||
        (t.recipient_name || '').toLowerCase().includes(q) ||
        (t.user_name || '').toLowerCase().includes(q) ||
        String(t.transaction_id).includes(q)
      );
    });
  }, [txns, search, type, userId, dateFrom, dateTo, min, max]);

  const clear = () => { setSearch(''); setType('all'); setUserId(''); setDateFrom(''); setDateTo(''); setMin(''); setMax(''); };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">All User Transactions</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg text-gray-800">Filter Transactions</h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, user, recipient, ID…"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Types</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
            <input type="text" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min Amount" className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
              <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max Amount" className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-2 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            <XCircle className="w-4 h-4" /> Clear Filters
          </button>
        </div>
        <div className="mt-2 text-sm text-gray-600">Showing {filtered.length} of {txns.length} transactions</div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-700">Transaction ID</th>
                <th className="px-6 py-3 text-left text-gray-700">User</th>
                <th className="px-6 py-3 text-left text-gray-700">Date & Time</th>
                <th className="px-6 py-3 text-left text-gray-700">Type</th>
                <th className="px-6 py-3 text-left text-gray-700">Counterparty</th>
                <th className="px-6 py-3 text-right text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((t) => (
                <tr key={t.transaction_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-800">{t.transaction_id}</td>
                  <td className="px-6 py-4 text-gray-600">{t.user_name} <span className="text-xs text-gray-400">({t.user_id})</span></td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(t.created_at)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs ${t.type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{t.type}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-800">{t.recipient_name || '—'}</td>
                  <td className={`px-6 py-4 text-right ${t.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {t.type === 'debit' ? '-' : '+'}{formatMoney(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
