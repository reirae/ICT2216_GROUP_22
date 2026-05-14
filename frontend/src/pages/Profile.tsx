import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';

interface ProfileData {
  user: {
    user_id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
    account_number: string;
    status: string;
    created_at: string;
  };
}

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<ProfileData>('/user/profile').then(setData).catch((e) => setError(e.message));
  }, []);

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(''); setPwOk('');
    if (!cur || !next || !confirm) return setPwError('All fields are required.');
    if (!PATTERNS.password.test(next))
      return setPwError('New password must be 8+ chars with upper, lower, digit, and symbol.');
    if (next !== confirm) return setPwError('New passwords do not match.');
    setBusy(true);
    try {
      await api.put('/user/password', { current_password: cur, new_password: next });
      setPwOk('Password updated.');
      setCur(''); setNext(''); setConfirm('');
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p className="text-gray-500">Loading…</p>;
  const u = data.user;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">Profile Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl text-gray-800 mb-4">Profile Details</h3>
          <div className="space-y-4">
            <Detail label="Full Name" value={`${u.first_name} ${u.last_name}`} />
            <Detail label="Username" value={u.username} />
            <Detail label="Email" value={u.email} />
            <Detail label="Phone" value={u.phone_number || '—'} />
            <Detail label="Account Number" value={u.account_number} />
            <div>
              <p className="text-gray-600 text-sm mb-1">Account Status</p>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm ${
                u.status === 'active' ? 'bg-green-100 text-green-700' :
                u.status === 'suspended' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
              }`}>{u.status}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl text-gray-800 mb-4">Change Password</h3>
          <form onSubmit={onChangePassword} className="space-y-4">
            <PwField label="Current Password" value={cur} onChange={setCur} />
            <PwField label="New Password" value={next} onChange={setNext} hint="Min 8 chars, upper/lower/digit/symbol" />
            <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} />
            {pwError && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{pwError}</div>}
            {pwOk && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{pwOk}</div>}
            <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-gray-600 text-sm mb-1">{label}</p>
      <p className="text-gray-800">{value}</p>
    </div>
  );
}

function PwField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="block text-sm sm:text-base text-gray-700 mb-2">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={128}
        className="w-full px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
