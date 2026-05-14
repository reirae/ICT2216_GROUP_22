import { useEffect, useState } from 'react';
import { Plus, Trash2, User, Users } from 'lucide-react';
import { api } from '../api/client';

interface Recipient {
  user_recipient_id: number;
  recipient_id: number;
  first_name: string;
  last_name: string;
  account_number: string;
  created_at: string;
}

export default function Recipients() {
  const [items, setItems] = useState<Recipient[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () =>
    api.get<{ recipients: Recipient[] }>('/user/recipients')
      .then((d) => setItems(d.recipients))
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const add = async () => {
    setError(''); setInfo('');
    if (!identifier.trim()) return setError('Account number or phone is required.');
    try {
      await api.post('/user/recipients', { identifier: identifier.trim() });
      setIdentifier('');
      setShowAdd(false);
      setInfo('Recipient saved.');
      await load();
      setTimeout(() => setInfo(''), 2500);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Remove this recipient?')) return;
    try { await api.del(`/user/recipients/${id}`); await load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-4">
        <h1 className="text-2xl sm:text-3xl text-gray-800">Saved Recipients</h1>
        <button
          onClick={() => { setShowAdd(true); setError(''); setInfo(''); }}
          className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center text-sm sm:text-base w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5 mr-2" /> Add Recipient
        </button>
      </div>

      {info && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">{info}</div>}

      {showAdd && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-xl text-gray-800 mb-4">Add New Recipient</h3>
          <p className="text-xs text-gray-500 mb-2">
            Enter the recipient's <strong>account number</strong> (10-20 digits) or <strong>phone number</strong>.
          </p>
          <div className="space-y-4">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. 1234567890 or +6598765001"
              maxLength={30}
              className="w-full px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <div className="flex gap-3">
              <button onClick={add} className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Add</button>
              <button onClick={() => { setShowAdd(false); setError(''); }} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((r) => (
            <div key={r.user_recipient_id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <button onClick={() => remove(r.user_recipient_id)} className="text-red-600 hover:text-red-700" aria-label="Delete recipient">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="text-lg text-gray-800 mb-1">{r.first_name} {r.last_name}</h3>
              <p className="text-sm text-gray-600 mb-1">{r.account_number}</p>
              <p className="text-xs text-gray-500">SecureBank</p>
            </div>
          ))}
        </div>
      ) : (
        !showAdd && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No recipients added yet</p>
            <p className="text-sm text-gray-400 mt-2">Add recipients to make transfers easier</p>
          </div>
        )
      )}
    </div>
  );
}
