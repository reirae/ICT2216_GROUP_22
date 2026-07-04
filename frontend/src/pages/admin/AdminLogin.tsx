import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { PATTERNS } from '../../utils/format';
import { api } from '../../api/client';

export default function AdminLogin() {
  const { login, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [requires2FA, setRequires2FA] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false); 
  const [showQR, setShowQR] = useState(false);             
  const [tempSecret, setTempSecret] = useState('');         
  const [qrCode, setQrCode] = useState('');                 
  const [otp, setOtp] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const resetTurnstile = () => {
    turnstileRef.current?.reset();
    setCaptcha('');
  };

  const handleShowQRCode = async () => {
    setError('');
    setBusy(true);
    try {
      const setupRes = await api.post<{ qrCode: string; tempSecret: string }>('/auth/generate-onboarding-2fa', { mfaToken });
      setQrCode(setupRes.qrCode);
      setTempSecret(setupRes.tempSecret);
      setShowQR(true);
    } catch (setupErr: any) {
      setError(setupErr.response?.data?.error || 'Failed to initialize admin onboarding streams.');
    } finally {
      setBusy(false);
    }
  };

  // Helper helper to determine the correct target route matching username contexts
  const getTargetRoute = (role: string, userNm: string) => {
    return role === 'business_admin' ? '/admin/users' : '/admin/logs';
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!requires2FA && !isOnboarding) {
      if (!PATTERNS.username.test(username)) {
        setError('Invalid admin username format.');
        return;
      }
      if (!password) return setError('Password is required.');
      setBusy(true);
      try {
        const response = await login('admin', { username, password, captcha });

        if (response && response.requires2FA) {
          setMfaToken(response.mfaToken);
          if (response.isSetupPending) {
            setIsOnboarding(true); 
          } else {
            setRequires2FA(true);  
          }
        } else if (response && response.user) {
          await refresh();
          const targetPath = getTargetRoute(response.user.role as string, username);
          nav(targetPath, { replace: true });
        }
      } catch (err: any) {
        setError(err.message || 'Login failed');
        resetTurnstile();
      } finally {
        setBusy(false);
      }
    } else {
      if (isOnboarding && !showQR) {
        setError('Please generate and scan your QR code before verifying.');
        return;
      }
      if (!otp || otp.length !== 6) {
        setError('Please enter a valid 6-digit verification code.');
        return;
      }
      setBusy(true);
      try {
        const verifyRes = await api.post<{ user?: { role: string } }>('/auth/verify-otp', { 
          otp, 
          mfaToken,
          tempSecret: isOnboarding ? tempSecret : undefined 
        });

        await refresh();
        const detectedRole = verifyRes?.user?.role as string || 'admin';
        window.location.href = getTargetRoute(detectedRole, username);
      } catch (err: any) {
        const details = err.details || {};
        if (details.clearMfaState) {
          setRequires2FA(false);
          setIsOnboarding(false);
          setShowQR(false);
          setMfaToken(null);
          setQrCode('');
          setTempSecret('');
          setOtp('');
          setUsername('');
          setPassword('');
          resetTurnstile();
          setError(err.message || 'Too many failed attempts. Please sign in again.');
        } else if (details.mfaToken) {
          setMfaToken(details.mfaToken);
          setError(`${err.message} (${details.attemptsRemaining} attempts remaining)`);
        } else {
          setError(err.response?.data?.error || err.message || 'Invalid verification code.');
        }
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 mr-2 sm:mr-3" />
            <h1 className="text-xl sm:text-2xl text-blue-600">SecureBank · Admin</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl text-gray-800 text-center mb-6">
            {(requires2FA || isOnboarding) ? 'Security Verification' : 'Administrator Sign In'}
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            {!requires2FA && !isOnboarding ? (
              <>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Turnstile ref={turnstileRef} siteKey={(import.meta as any).env.VITE_CFTS_SITE_KEY!} onSuccess={(token) => setCaptcha(token)} onError={() => setError('Verification failed. Please try again.')} onExpire={() => setCaptcha('')}/>
              </>
            ) : (
              <div className="space-y-4 text-center">
                <div className="flex justify-center text-blue-600">
                  <Lock className="w-12 h-12" />
                </div>
                <h3 className="text-md font-medium text-gray-800">
                  {isOnboarding ? 'Mandatory Admin Authenticator Link' : 'Admin Security Challenge'}
                </h3>
                <p className="text-xs text-gray-600">
                  {isOnboarding 
                    ? 'To safeguard administrative privileges, you must tie an authenticator device key config configuration below.' 
                    : 'Please enter the rolling 6-digit operational matrix key from your device.'}
                </p>

                {isOnboarding && !showQR && (
                  <button
                    type="button"
                    onClick={handleShowQRCode}
                    disabled={busy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm"
                  >
                    <QrCode className="w-4 h-4" />
                    Reveal Admin Setup QR Code
                  </button>
                )}

                {isOnboarding && showQR && qrCode && (
                  <div className="flex flex-col items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <img src={qrCode} alt="Onboarding QR Code" className="w-44 h-44 bg-white p-2 border rounded shadow-sm" />
                    <p className="text-[11px] text-gray-500 font-mono mt-3 bg-gray-100 p-2 rounded border border-gray-200 select-all w-full text-center">
                      Secret: {tempSecret}
                    </p>
                  </div>
                )}

                {(!isOnboarding || showQR) && (
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center tracking-widest text-2xl font-bold px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="000000"
                    />
                  </div>
                )}
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center">{error}</div>}

            {(!isOnboarding || showQR) && (
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {busy ? 'Signing in…' : (requires2FA || isOnboarding) ? 'Verify Admin Token' : 'Sign In'}
              </button>
            )}

            {(requires2FA || isOnboarding) && (
              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setIsOnboarding(false);
                  setShowQR(false);
                  setMfaToken(null);
                  setQrCode('');
                  setTempSecret('');
                  setOtp('');
                  setError('');
                  setUsername('');
                  setPassword('');
                  resetTurnstile();
                }}
                className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
              >
                Back to Admin Login
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}