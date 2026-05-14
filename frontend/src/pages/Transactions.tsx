import { useEffect, useMemo, useState } from 'react';
import { Search, XCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { api } from '../api/client';
import { formatDate, formatMoney } from '../utils/format';

interface Txn {
  transaction_id: number;
  type: 'debit' | 'credit';
  amount: string;
  description: string | null;
  created_at: string;
  recipient_name: string | null;
  recipient_account: string | null;
}

export default function Transactions() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'debit' | 'credit'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ transactions: Txn[] }>('/user/transactions')
      .then((d) => setTxns(d.transactions))
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter((t) => {
      const matchType = type === 'all' || t.type === type;
      if (!matchType) return false;
      if (!q) return true;
      return (
        (t.description || '').toLowerCase().includes(q) ||
        (t.recipient_name || '').toLowerCase().includes(q) ||
        (t.recipient_account || '').includes(q) ||
        String(t.transaction_id).includes(q)
      );
    });
  }, [txns, search, type]);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">Transaction History</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, recipient, account, ID…"
              className="w-full pl-10 pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
          <button
            onClick={() => { setSearch(''); setType('all'); }}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm sm:text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <XCircle className="w-4 h-4" /> Clear Filters
          </button>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-gray-600">
          Showing {filtered.length} of {txns.length} transactions
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="lg:hidden space-y-4">
        {filtered.map((txn) => (
          <div key={txn.transaction_id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center">
                <div className={`w-8 h-8 ${txn.type === 'debit' ? 'bg-red-100' : 'bg-green-100'} rounded-full flex items-center justify-center mr-2`}>
                  {txn.type === 'debit' ? <ArrowUpRight className="w-4 h-4 text-red-600" /> : <ArrowDownLeft className="w-4 h-4 text-green-600" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{txn.recipient_name || (txn.type === 'debit' ? 'Outgoing' : 'Incoming')}</p>
                  <p className="text-xs text-gray-500">{formatDate(txn.created_at)}</p>
                </div>
              </div>
              <p className={`text-base font-medium ${txn.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                {txn.type === 'debit' ? '-' : '+'}{formatMoney(txn.amount)}
              </p>
            </div>
            <p className="text-xs text-gray-600 mt-2">{txn.description}</p>
          </div>
        ))}
      </div>

      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-700">Date & Time</th>
                <th className="px-6 py-3 text-left text-gray-700">Type</th>
                <th className="px-6 py-3 text-left text-gray-700">Counterparty</th>
                <th className="px-6 py-3 text-left text-gray-700">Description</th>
                <th className="px-6 py-3 text-right text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((txn) => (
                <tr key={txn.transaction_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(txn.created_at)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-xs ${txn.type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {txn.type === 'debit' ? 'Debit' : 'Credit'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-800">{txn.recipient_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{txn.description}</td>
                  <td className={`px-6 py-4 text-right ${txn.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {txn.type === 'debit' ? '-' : '+'}{formatMoney(txn.amount)}
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
