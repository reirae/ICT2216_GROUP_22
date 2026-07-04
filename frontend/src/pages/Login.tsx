import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, QrCode } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PATTERNS } from '../utils/format';
import { api } from '../api/client';
import { useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export default function Login() {
  const { login, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [captcha, setCaptcha] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // --- 2FA FRONTEND STATES ---
  const [requires2FA, setRequires2FA] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false); 
  const [showQR, setShowQR] = useState(false);             // NEW: Keeps QR hidden until button is clicked
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
      // Calls our public auth onboarding route to bypass the cookie session lock
      const setupRes = await api.post<{ qrCode: string; tempSecret: string }>('/auth/generate-onboarding-2fa', { mfaToken });
      setQrCode(setupRes.qrCode);
      setTempSecret(setupRes.tempSecret);
      setShowQR(true);
    } catch (setupErr: any) {
      setError(setupErr.response?.data?.error || 'Failed to safely initialize 2FA configuration streams.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // STAGE 1: Standard Credentials Submission
    if (!requires2FA && !isOnboarding) {
      if (!PATTERNS.username.test(username)) {
        setError('Username must start with a letter and be 3-50 characters.');
        return;
      }
      if (!password) {
        setError('Password is required.');
        return;
      }
      setBusy(true);
      try {
        const response = await login('user', { username, password, captcha });

        if (response && response.requires2FA) {
          // Save the secure token passed by the server's response body
          setMfaToken(response.mfaToken);
          if (response.isSetupPending) {
            // Secure by Default: Land on the onboarding page entry, but KEEP QR hidden!
            setIsOnboarding(true);
          } else {
            // Standard Challenge Loop
            setRequires2FA(true);
          }
        } else if (response && response.user) {
          await refresh();
          nav('/dashboard', { replace: true });
        }
      } catch (err: any) {
        setError(err.message || 'Login failed');
        resetTurnstile();
      } finally {
        setBusy(false);
      }
    }
    // STAGE 2: 2FA / Onboarding Verification Submission
    else {
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
        await api.post('/auth/verify-otp', { 
          otp, 
          mfaToken,
          tempSecret: isOnboarding ? tempSecret : undefined 
        });
        
        window.location.href = '/dashboard';
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
          setMfaToken(details.mfaToken); // Update to new token data string
          setError(`${err.message} (${details.attemptsRemaining} attempts remaining)`);
        } else {
          setError(err.response?.data?.error || err.message || 'Invalid verification code. Please try again.');
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
            <h1 className="text-xl sm:text-2xl text-blue-600">SecureBank</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl text-gray-800 text-center mb-6">
            {(requires2FA || isOnboarding) ? 'Security Verification' : 'Sign In'}
          </h2>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">

            {!requires2FA && !isOnboarding ? (
              <>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter username"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter password"
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
              <div className="animate-fade-in space-y-4">
                <div className="flex justify-center mb-2 text-blue-600">
                  <Lock className="w-12 h-12" />
                </div>
                
                <h3 className="text-md font-medium text-center text-gray-800">
                  {isOnboarding ? 'Mandatory Authenticator Setup' : 'Security Verification Challenge'}
                </h3>
                
                <p className="text-xs text-gray-600 text-center">
                  {isOnboarding 
                    ? 'To safely activate your digital banking profile defense matrix, you must bind an authenticator application device configuration below.' 
                    : 'Please open your authenticator app on your device and enter your active 6-digit confirmation token to log in.'}
                </p>

                {/* Onboarding Flow: Show Button first, hide QR code exactly like profile.tsx */}
                {isOnboarding && !showQR && (
                  <button
                    type="button"
                    onClick={handleShowQRCode}
                    disabled={busy}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors text-sm shadow-sm"
                  >
                    <QrCode className="w-4 h-4" />
                    Reveal Setup QR Code
                  </button>
                )}

                {isOnboarding && showQR && qrCode && (
                  <div className="flex flex-col items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <p className="text-[10px] text-gray-400 font-mono select-none uppercase tracking-wider mb-2">Scan on mobile app device</p>
                    <img src={qrCode} alt="Onboarding QR Code" className="w-44 h-44 bg-white p-2 border rounded shadow-sm" />
                    {/* <p className="text-[10px] text-gray-400 font-mono mt-2 select-all">Secret: {tempSecret}</p> */}
                  </div>
                )}

                {(!isOnboarding || showQR) && (
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-2 font-medium text-center">
                      Enter Verification Code
                    </label>
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

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            {(!isOnboarding || showQR) && (
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {busy ? 'Processing…' : (requires2FA || isOnboarding) ? 'Verify Code' : 'Sign In'}
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
                Back to Sign In
              </button>
            )}
          </form>

          {!requires2FA && !isOnboarding && (
            <>
              <div className="mt-6 text-center text-sm sm:text-base text-gray-600">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 hover:underline">Register here</Link>
              </div>
              <div className="mt-3 text-center text-sm sm:text-base text-gray-600">
                <Link to="/reset-password" className="text-blue-600 hover:underline text-sm">
                  Forgot password?
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}