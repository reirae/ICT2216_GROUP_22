import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, TrendingUp, Users, CreditCard } from 'lucide-react';
import { api } from '../api/client';
import { formatDate, formatMoney } from '../utils/format';
import PageLoader from '../components/PageLoader';

interface DashboardData {
  user: { first_name: string; last_name: string; account_number: string; balance: string; status: string };
  recent: Array<{
    transaction_id: number;
    type: 'debit' | 'credit';
    amount: string;
    description: string | null;
    created_at: string;
  }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/user/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <PageLoader />;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">
        Welcome, {data.user.first_name} {data.user.last_name}
      </h1>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 lg:p-8 text-white mb-4 sm:mb-6">
        <p className="text-blue-100 mb-2 text-sm sm:text-base">Available Balance</p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4">{formatMoney(data.user.balance)}</h2>
        <p className="text-blue-100 text-xs sm:text-sm">Account: {data.user.account_number}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link to="/transfer" className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow flex items-center justify-between">
          <div>
            <p className="text-gray-600 mb-1">Transfer Funds</p>
            <p className="text-sm text-gray-500">Send money</p>
          </div>
          <CreditCard className="w-8 h-8 text-blue-600" />
        </Link>
        <Link to="/transactions" className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow flex items-center justify-between">
          <div>
            <p className="text-gray-600 mb-1">Transactions</p>
            <p className="text-sm text-gray-500">View history</p>
          </div>
          <TrendingUp className="w-8 h-8 text-green-600" />
        </Link>
        <Link to="/recipients" className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow flex items-center justify-between">
          <div>
            <p className="text-gray-600 mb-1">Recipients</p>
            <p className="text-sm text-gray-500">Manage contacts</p>
          </div>
          <Users className="w-8 h-8 text-purple-600" />
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl text-gray-800 mb-3 sm:mb-4">Recent Transactions</h3>
        {data.recent.length === 0 ? (
          <p className="text-gray-500 text-sm">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {data.recent.map((txn) => (
              <div key={txn.transaction_id} className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center min-w-0 flex-1 mr-2">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mr-2 sm:mr-3 flex-shrink-0 ${txn.type === 'debit' ? 'bg-red-100' : 'bg-green-100'}`}>
                    {txn.type === 'debit'
                      ? <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                      : <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base text-gray-800 truncate">{txn.description || (txn.type === 'debit' ? 'Debit' : 'Credit')}</p>
                    <p className="text-xs sm:text-sm text-gray-500">{formatDate(txn.created_at)}</p>
                  </div>
                </div>
                <p className={`text-sm sm:text-base flex-shrink-0 ${txn.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                  {txn.type === 'debit' ? '-' : '+'}{formatMoney(txn.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
