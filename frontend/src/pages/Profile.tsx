import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';
import { AlertTriangle } from 'lucide-react';

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
    hasMfaEnabled: number;
  };
}

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  const [tempSecret, setTempSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [mfaSuccess, setMfaSuccess] = useState('');
  const [mfaError, setMfaError] = useState('');

  // --- UI Layout Controls ---
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false); // In-card confirmation block state

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<ProfileData>('/user/profile').then(setData).catch((e) => setError(e.message));
  }, []);

  const handleSetup2FA = async () => {
    try {
      setError('');
      setMfaSuccess('');
      setMfaError(''); 
      const response = await api.post<{ qrCode: string; tempSecret: string }>('/user/generate-2fa');
      setQrCode(response.qrCode);
      setTempSecret(response.tempSecret); 
    } catch (e: any) {
      setMfaError(e.message || 'Failed to initialize 2FA generation sequence.');
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setError('');
      setMfaSuccess('');
      setMfaError(''); 
      
      const response = await api.post<{ message: string }>('/user/verify-and-activate-2fa', {
        token: verificationCode,
        tempSecret: tempSecret
      });

      setMfaSuccess(response.message);
      setQrCode(null); 
      setTempSecret(null);
      setVerificationCode('');
      
      if (data?.user) {
        setData({ ...data, user: { ...data.user, status: 'active_mfa', hasMfaEnabled: 1 } });
      }
    } catch (e: any) {
      setMfaError(e.response?.data?.error || e.message || 'Invalid activation token code. Please retry.');
    }
  };

  const handleDisable2FA = async () => {
    setBusy(true);
    try {
      setError('');
      setMfaSuccess('');
      setMfaError('');

      const response = await api.post<{ message: string }>('/user/disable-2fa');
      setMfaSuccess(response.message);
      setIsConfirmingDisable(false);

      if (data?.user) {
        setData({ ...data, user: { ...data.user, hasMfaEnabled: 0 } });
      }
    } catch (e: any) {
      setMfaError(e.response?.data?.error || e.message || 'Failed to safely remove authentication parameters.');
    } finally {
      setBusy(false);
    }
  };

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
                (u.status === 'active' || u.status === 'active_mfa') ? 'bg-green-100 text-green-700' :
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

        {/* Two-Factor Authentication Card */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-lg sm:text-xl text-gray-800 mb-2">Two-Factor Authentication (2FA)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enhance your digital banking protection by linking an authenticator application (e.g., Google Authenticator).
            </p>

            {mfaSuccess && (
              <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
                {mfaSuccess}
              </div>
            )}

            {mfaError && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 w-full text-center">
                {mfaError}
              </div>
            )}
            
            {/* Display Setup QR Step */}
            {qrCode && (
              <div className="flex flex-col items-center bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 animate-fade-in">
                <p className="text-xs text-gray-500 font-medium mb-2 text-center uppercase tracking-wider">
                  Scan this QR code on your mobile device
                </p>
                <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 border bg-white p-2 rounded-md shadow-sm" />
              
                <form onSubmit={handleVerify2FA} className="mt-4 w-full max-w-[240px]">
                  <label className="block text-xs font-semibold text-gray-600 text-left mb-1">
                    Enter Authenticator 6-Digit Code:
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 123456"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center border p-2 rounded-lg shadow-sm tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full mt-2 bg-blue-600 text-white text-xs py-2 rounded-md font-medium hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Confirm & Activate 2FA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQrCode(null);
                      setTempSecret(null);
                      setVerificationCode('');
                      setMfaError('');
                    }}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-2 rounded-md font-medium transition-colors border border-gray-200"
                  >
                    Cancel & Go Back
                  </button>
                </form>
              </div>
            )}

            {/* Custom Inline Warning Block (Replaces the ugly popup alert) */}
            {isConfirmingDisable && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-4 animate-fade-in text-sm">
                <div className="flex items-start gap-2 font-semibold mb-1 text-red-700">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>DANGEROUS SECURITY DOWNGRADE</span>
                </div>
                <p className="text-xs text-red-600 mb-3">
                  Disabling Two-Factor Authentication significantly lowers your security perimeter against credential theft and fraud vectors.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDisable2FA}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium transition-colors"
                  >
                    Yes, Remove Protection
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDisable(false)}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!qrCode && !isConfirmingDisable && (
              <div className="text-sm text-gray-500 text-center py-4">
                {u.hasMfaEnabled === 1 ? (
                  <span className="text-green-600 font-medium">✓ Two-Factor Authentication is currently active on your account.</span>
                ) : (
                  <span className="text-gray-500">2FA setup is pending activation setup.</span>
                )}
              </div>
            )}
          </div>

          {/* Dual Action Option Controls */}
          {!qrCode && !isConfirmingDisable && (
            <div className="space-y-2 mt-auto">
              {u.hasMfaEnabled === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={handleSetup2FA}
                    className="w-full bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 font-medium transition-colors text-sm"
                  >
                    Regenerate Authentication Secret QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDisable(true)}
                    className="w-full bg-red-100 text-red-700 py-2.5 rounded-lg hover:bg-red-200 font-medium transition-colors text-sm"
                  >
                    Disable Authenticator 2FA Protection
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSetup2FA}
                  className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-medium transition-colors"
                >
                  Enable Authenticator 2FA
                </button>
              )}
            </div>
          )}
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