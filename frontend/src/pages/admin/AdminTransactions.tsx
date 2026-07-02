import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { formatDate, formatMoney } from '../../utils/format';
import PageLoader from '../../components/PageLoader';

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
  recipient_account: string | null;
}

export default function AdminTransactions() {
  const [txns, setTxns] = useState<AdminTxn[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ transactions: AdminTxn[] }>('/admin/transactions')
      .then((d) => setTxns(d.transactions))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    // Create timestamps for filter boundaries (if they exist)
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity; // Add 24h to include the full 'to' day

    // Sort transactions
    const sortedTxns = [...txns].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return sortedTxns.filter((t) => {
      // Convert transaction string to a timestamp
      const txTime = new Date(t.created_at.replace(' ', 'T')).getTime();
      
      // Date Filtering
      if (dateFrom && txTime < fromTime) return false;
      if (dateTo && txTime > toTime) return false;
      
      // Amount Filtering
      const signedAmt = t.type === 'debit' ? -Number(t.amount) : Number(t.amount);
      if (min && signedAmt < Number(min)) return false;
      if (max && signedAmt > Number(max)) return false;
      
      // Search Filtering
      if (!q) return true;
      return (
        (t.description || '').toLowerCase().includes(q) ||
        (t.recipient_name || '').toLowerCase().includes(q) ||
        (t.user_name || '').toLowerCase().includes(q) ||
        String(t.transaction_id).includes(q)
      );
    });
  }, [txns, search, dateFrom, dateTo, min, max]);

  const clear = () => { setSearch(''); setDateFrom(''); setDateTo(''); setMin(''); setMax(''); };

  if (loading) return <PageLoader />;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">All Transactions</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          <h3 className="text-base sm:text-lg text-gray-800">Filter Transactions</h3>
        </div>
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for recipient, counterparty, transaction ID, description"
              className="w-full pl-10 pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min Amount" className="w-full sm:flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max Amount" className="w-full sm:flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <button onClick={clear} className="flex items-center gap-2 px-4 py-2 text-sm sm:text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            <XCircle className="w-4 h-4" /> Clear Filters
          </button>
        </div>
        <div className="mt-2 text-xs sm:text-sm text-gray-600">Showing {filtered.length} of {txns.length} transactions</div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-1/5 px-6 py-3 text-left text-gray-700">Date & Time</th>
                <th className="w-1/7 px-6 py-3 text-left text-gray-700">Transaction ID</th>
                <th className="w-1/6 px-6 py-3 text-left text-gray-700">User</th>
                <th className="w-1/6 px-6 py-3 text-left text-gray-700">Counterparty</th>
                <th className="w-1/4 px-6 py-3 text-right text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((t) => (
                <tr key={t.transaction_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(t.created_at)}</td>
                  <td className="px-6 py-4 text-gray-800 whitespace-nowrap truncate">{t.transaction_id}</td>
                  <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{t.user_name} 
                    {//<span className="text-xs text-gray-400">({t.user_id})</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-gray-800 max-w-xs truncate whitespace-nowrap font-medium">{t.recipient_name || '—'}</td>
                  <td className={`px-6 py-4 text-right ${t.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                    {t.type === 'debit' ? '-' : '+'}{formatMoney(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lg:hidden space-y-4">
        {filtered.map((t) => (
          <div key={t.transaction_id} className="bg-white rounded-lg shadow p-4 sm:p-5 border border-gray-100">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm sm:text-base truncate">
                  {t.user_name || 'Unknown User'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">User Account:{t.user_account || 'no-account'}</p>
              </div>
              <span className={`text-base font-bold flex-shrink-0 whitespace-nowrap ${t.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                {t.type === 'debit' ? '-' : '+'}{formatMoney(t.amount)}
              </span>
            </div>
            
            <div className="space-y-1.5 text-sm text-gray-600 border-t border-gray-100 pt-2.5">
              <p className="truncate"><span className="text-gray-400 font-medium">Transaction ID:</span> {t.transaction_id}</p>
              <p className="truncate"><span className="text-gray-400 font-medium">User ID:</span> {t.user_id}</p>
              <p className="truncate"><span className="text-gray-400 font-medium">Date:</span> {formatDate(t.created_at)}</p>
              <p className="truncate"><span className="text-gray-400 font-medium">Counterparty:</span> {t.recipient_name || '—'}</p>
              {t.description && (
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-2 border border-gray-100 truncate">
                  <span className="text-gray-400 block font-medium mb-0.5">Description:</span>
                  {t.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}