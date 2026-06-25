import { useEffect, useState } from 'react';
import { Check, DollarSign, QrCode } from 'lucide-react';
import { api } from '../api/client';
import { formatMoney } from '../utils/format';

interface Recipient {
  user_recipient_id: number;
  recipient_id: number;
  first_name: string;
  last_name: string;
  account_number: string;
}

interface DashboardData { user: { balance: string; account_number: string } }

export default function Transfer() {
  const [saved, setSaved] = useState<Recipient[]>([]);
  const [balance, setBalance] = useState<string>('0');
  const [mode, setMode] = useState<'saved' | 'lookup'>('saved');
  const [selected, setSelected] = useState<{ user_id: number; name: string; account_number: string } | null>(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ recipients: Recipient[] }>('/user/recipients').then((d) => setSaved(d.recipients)).catch(() => {});
    api.get<DashboardData>('/user/dashboard').then((d) => setBalance(d.user.balance)).catch(() => {});
  }, []);

  const findByIdentifier = async () => {
    setError(''); setSelected(null);
    const q = lookupQuery.trim();
    if (!q) return setError('Enter an account number or phone.');
    try {
      const { recipient } = await api.get<{ recipient: { user_id: number; first_name: string; last_name: string; account_number: string } }>(
        `/user/lookup?q=${encodeURIComponent(q)}`
      );
      setSelected({
        user_id: recipient.user_id,
        name: `${recipient.first_name} ${recipient.last_name}`,
        account_number: recipient.account_number,
      });
    } catch (e: any) {
      setError(e.message || 'Lookup failed');
    }
  };

  const onContinue = () => {
    setError('');
    if (!selected) return setError('Please select a recipient.');
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return setError('Enter a positive amount.');
    if (n > Number(balance)) return setError('Insufficient balance.');
    setConfirming(true);
  };

  const onConfirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post('/user/transfer', {
        recipient_id: selected.user_id,
        amount,
        description: desc || undefined,
      });
      setSuccess(true);
      setConfirming(false);
      setAmount(''); setDesc(''); setSelected(null); setLookupQuery('');
      const d = await api.get<DashboardData>('/user/dashboard');
      setBalance(d.user.balance);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">Transfer Funds</h1>

      {success && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 sm:px-6 py-3 sm:py-4 rounded-lg mb-4 sm:mb-6 flex items-center text-sm sm:text-base">
          <Check className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
          <span>Transfer completed successfully!</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 sm:p-6 max-w-2xl">
        {!confirming ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs sm:text-sm text-gray-600">Available Balance</p>
              <p className="text-xl sm:text-2xl text-gray-800">{formatMoney(balance)}</p>
            </div>

            <div className="flex gap-2 border-b">
              {(['saved', 'lookup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setSelected(null); setError(''); }}
                  className={`px-4 py-2 text-sm sm:text-base -mb-px border-b-2 ${
                    mode === m ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'
                  }`}
                >
                  {m === 'saved' ? 'Saved recipient' : 'Account / Phone'}
                </button>
              ))}
            </div>

            {mode === 'saved' && (
              <div className="space-y-2">
                {saved.length === 0 && <p className="text-sm text-gray-500">No saved recipients. Use the Account / Phone tab.</p>}
                {saved.map((r) => {
                  const isSel = selected?.user_id === r.recipient_id;
                  return (
                    <button
                      key={r.user_recipient_id}
                      onClick={() => setSelected({ user_id: r.recipient_id, name: `${r.first_name} ${r.last_name}`, account_number: r.account_number })}
                      className={`w-full p-3 sm:p-4 border rounded-lg text-left transition-all ${
                        isSel ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      <p className="text-sm sm:text-base text-gray-800">{r.first_name} {r.last_name}</p>
                      <p className="text-xs sm:text-sm text-gray-600">{r.account_number}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {mode === 'lookup' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    placeholder="Account number or phone"
                    maxLength={30}
                    className="flex-1 px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={findByIdentifier} className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                    Look up
                  </button>
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <QrCode className="w-3 h-3" /> QR code transfer with 6-7 minute timeout — coming soon.
                </p>
              </div>
            )}

            {selected && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Recipient</p>
                <p className="text-base text-gray-800">{selected.name} · {selected.account_number}</p>
              </div>
            )}

            <div>
              <label className="block text-sm sm:text-base text-gray-700 mb-2">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm sm:text-base">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm sm:text-base text-gray-700 mb-2">Description (Optional)</label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={100}
                className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter description"
              />
            </div>

            {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <button onClick={onContinue} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700">
              Continue
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl text-gray-800 mb-2">Confirm Transfer</h3>
              <p className="text-gray-600">Please review the transfer details</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div className="flex justify-between"><span className="text-gray-600">Recipient</span><span className="text-gray-800">{selected?.name}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Account Number</span><span className="text-gray-800">{selected?.account_number}</span></div>
              <div className="border-t border-gray-300 pt-4 flex justify-between">
                <span className="text-gray-600">Amount</span>
                <span className="text-xl text-gray-800">{formatMoney(amount)}</span>
              </div>
              {desc && <div className="flex justify-between"><span className="text-gray-600">Description</span><span className="text-gray-800">{desc}</span></div>}
            </div>
            {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400" disabled={busy}>Back</button>
              <button onClick={onConfirm} disabled={busy} className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                {busy ? 'Processing…' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
