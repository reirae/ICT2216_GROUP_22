import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';
import { AlertTriangle, Lock } from 'lucide-react';
import PageLoader from '../components/PageLoader';

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
  const [disableCode, setDisableCode] = useState('');

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState('');
  const [isProfileBusy, setIsProfileBusy] = useState(false);
  const [isPasswordBusy, setIsPasswordBusy] = useState(false);
  const [isMfaBusy, setIsMfaBusy] = useState(false);

  // --- Dynamic Profile Edit Management States ---
  const [isEditing, setIsEditing] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    token: ''
  });

  useEffect(() => {
    api.get<ProfileData>('/user/profile').then(setData).catch((e) => setError(e.message));
  }, []);

  // Sync profile values into editing form state once loaded from API
  useEffect(() => {
    if (data?.user) {
      setEditForm({
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        email: data.user.email,
        phone_number: data.user.phone_number || '',
        token: ''
      });
    }
  }, [data]);

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
        setData({ ...data, user: { ...data.user, hasMfaEnabled: 1 } });
      }
    } catch (e: any) {
      setMfaError(e.response?.data?.error || e.message || 'Invalid activation token code. Please retry.');
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (u.hasMfaEnabled === 1 && (!disableCode || disableCode.length !== 6)) {
      setMfaError('Please enter a valid 6-digit verification code.');
      return;
    }

    // Change setBusy(true) to this:
    setIsMfaBusy(true); 
    try {
      setError('');
      setMfaSuccess('');
      setMfaError('');

      const response = await api.post<{ message: string }>('/user/disable-2fa', {
        token: disableCode
      });
      setMfaSuccess(response.message);
      setIsConfirmingDisable(false);
      setDisableCode('');

      if (data?.user) {
        setData({ ...data, user: { ...data.user, hasMfaEnabled: 0 } });
      }
    } catch (e: any) {
      setMfaError(e.response?.data?.error || e.message || 'Failed to safely remove authentication parameters.');
    } finally {
      // Change setBusy(false) to this:
      setIsMfaBusy(false);
    }
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(''); setPwOk('');
    if (!cur || !next || !confirm) return setPwError('All fields are required.');
    if (!PATTERNS.password.test(next))
      return setPwError('New password must be 8+ chars with upper, lower, digit, and symbol.');
    if (next !== confirm) return setPwError('New passwords do not match.');
    
    // Change setBusy(true) to this:
    setIsPasswordBusy(true);
    try {
      await api.put('/user/password', { current_password: cur, new_password: next });
      setPwOk('Password updated.');
      setCur(''); setNext(''); setConfirm('');
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      // Change setBusy(false) to this:
      setIsPasswordBusy(false);
    }
  };

  // --- Live End-to-End Profile Submission API Call ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    if (!PATTERNS.name.test(editForm.first_name) || !PATTERNS.name.test(editForm.last_name)) {
      return setProfileError('Names must start with letters and contain no special characters.');
    }
    if (!PATTERNS.email.test(editForm.email)) {
      return setProfileError('Invalid email format structure.');
    }
    if (editForm.phone_number && editForm.phone_number.length !== 8) {
      return setProfileError('Phone number must be exactly 8 digits long.');
    }

    // Change setBusy(true) to this:
    setIsProfileBusy(true);
    try {
      const response = await api.put<{ message: string }>('/user/profile', editForm);
      setProfileSuccess(response.message);
      setIsEditing(false);

      const updatedProfile = await api.get<ProfileData>('/user/profile');
      setData(updatedProfile);
    } catch (err: any) {
      setProfileError(err.response?.data?.error || err.message || 'Validation gate failed.');
    } finally {
      // Change setBusy(false) to this:
      setIsProfileBusy(false);
    }
  };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <PageLoader />;
  const u = data.user;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl text-gray-800 mb-4 sm:mb-6">Profile Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        
        {/* Dynamic Profile Details Container Card */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 relative">
          {/* Pencil Edit Icon Toggle Button Controls */}
          <button
            type="button"
            title={isEditing ? "Cancel editing" : "Edit profile details"}
            onClick={() => {
              setIsEditing(!isEditing);
              setProfileError('');
              setProfileSuccess('');
              if (data?.user) {
                setEditForm({
                  first_name: data.user.first_name,
                  last_name: data.user.last_name,
                  email: data.user.email,
                  phone_number: data.user.phone_number || '',
                  token: ''
                });
              }
            }}
            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            {isEditing ? (
              <span className="text-xs font-semibold px-2 py-1 bg-gray-200 rounded text-gray-700">Cancel</span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21H3v-3.5l12.828-12.828z" />
              </svg>
            )}
          </button>

          <h3 className="text-lg sm:text-xl text-gray-800 mb-4">Profile Details</h3>
          
          {profileSuccess && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-2 rounded-lg text-xs mb-3">{profileSuccess}</div>}
          {profileError && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-xs mb-3">{profileError}</div>}

          {!isEditing ? (
            /* STATIC DISPLAY VIEW MODE */
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
          ) : u.hasMfaEnabled === 0 ? (
            /* CRITICAL ENFORCEMENT: Block modification view interface if 2FA has been disabled */
            <div className="flex flex-col items-center justify-center text-center p-6 bg-gray-50 border border-dashed border-gray-300 rounded-xl animate-fade-in space-y-3">
              <div className="p-3 bg-amber-50 rounded-full border border-amber-200 text-amber-600">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-gray-800">Two-Factor Authentication Mandated</h4>
              <p className="text-xs text-gray-500 max-w-[280px]">
                To safeguard banking records, credentials can only be edited while 2FA device link tracking protection is active. Please turn on 2FA down below.
              </p>
              <button 
                type="button" 
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
          ) : (
            /* SECURE SUBMISSION FIELD MODE */
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={editForm.first_name}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-gray-800 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={editForm.last_name}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-gray-800 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Username (Immutable)</label>
                <input type="text" value={u.username} disabled className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email Address</label>
                <input
                  type="email"
                  maxLength={100}
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-gray-800 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8} // Hard-stops input length right at 8 numbers max
                  value={editForm.phone_number}
                  // Enforces digit-only matching natively as they type
                  onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-gray-800 focus:outline-none"
                  placeholder="e.g. 9123 4567"
                />
              </div>

              <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                <label className="block text-xs font-bold text-blue-800 mb-1">
                  Enter Authenticator 6-Digit Code to Authorize:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={editForm.token}
                  onChange={(e) => setEditForm({ ...editForm, token: e.target.value.replace(/\D/g, '') })}
                  className="w-full text-center tracking-widest font-mono font-bold text-lg p-2 border rounded-md focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isProfileBusy}
                className="w-full mt-2 bg-blue-600 text-white text-sm py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60"
              >
                {isProfileBusy ? 'Saving changes...' : 'Save Profile Changes'}
              </button>
            </form>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl text-gray-800 mb-4">Change Password</h3>
          <form onSubmit={onChangePassword} className="space-y-4">
            <PwField label="Current Password" value={cur} onChange={setCur} />
            <PwField label="New Password" value={next} onChange={setNext} hint="Min 8 chars, upper/lower/digit/symbol" />
            <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} />
            {pwError && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{pwError}</div>}
            {pwOk && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{pwOk}</div>}
            <button type="submit" disabled={isPasswordBusy} className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {isPasswordBusy ? 'Updating…' : 'Update Password'}
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

            {/* Custom Inline Warning Block */}
            {isConfirmingDisable && (
              <form onSubmit={handleDisable2FA} className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-4 animate-fade-in text-sm">
                <div className="flex items-start gap-2 font-semibold mb-1 text-red-700">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>DANGEROUS SECURITY DOWNGRADE</span>
                </div>
                <p className="text-xs text-red-600 mb-3">
                  Disabling Two-Factor Authentication significantly lowers your security perimeter against credential theft and fraud vectors.
                </p>

                {/* Secure Challenge Input Node */}
                {u.hasMfaEnabled === 1 && (
                  <div className="mb-3 bg-white p-2.5 rounded border border-red-200 max-w-[240px]">
                    <label className="block text-xs font-bold text-red-800 mb-1">
                      Enter Authenticator Code to Confirm:
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center tracking-widest font-mono font-bold text-base p-1.5 border rounded focus:ring-2 focus:ring-red-500 bg-gray-50 text-gray-900 focus:outline-none"
                      required
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isMfaBusy}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium transition-colors disabled:opacity-60"
                  >
                    {isMfaBusy ? 'Processing...' : 'Yes, Remove Protection'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingDisable(false);
                      setDisableCode('');
                    }}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
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