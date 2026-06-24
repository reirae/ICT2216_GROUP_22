import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Captcha } from '../components/Captcha';
import { PATTERNS } from '../utils/format';
import { api } from '../api/client';

export default function Login() {
  const { login, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // --- YUE HENG'S 2FA FRONTEND STATES ---
  const [requires2FA, setRequires2FA] = useState(false);
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Countdown timer effect for the resend button rate limit
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // STAGE 1: Standard Credentials Submission
    if (!requires2FA) {
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
        const response = await api.post<{ requires2FA?: boolean; user?: any }>('/auth/login', { username, password, captcha });

        if (response && response.requires2FA) {
          setRequires2FA(true);
          setCooldown(30);
          // ✅ Don't call login() again — session already has pendingUser stored
        } else if (response && response.user) {
          // No 2FA needed (admin, or user without phone number)
          await refresh();
          nav('/dashboard', { replace: true });
        }
      } catch (err: any) {
        setError(err.message || 'Login failed');
        setCaptchaKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    }
    // STAGE 2: 2FA Verification Submission
    else {
      if (!otp || otp.length !== 6) {
        setError('Please enter a valid 6-digit verification code.');
        return;
      }
      setBusy(true);
      try {
        await api.post('/auth/verify-otp', { otp });
        window.location.href = '/dashboard';
      } catch (err: any) {
        setError(err.message || 'Invalid verification code. Please try again.');
      } finally {
        setBusy(false);
      }
    }
  };

  // Triggers a fresh authentication request to generate a new token
  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setError('');
    setBusy(true);
    try {
      // Point to the new resend-otp route
      await api.post('/auth/resend-otp', {});
      setOtp('');
      setCooldown(30); // You can set this to 30s as you requested!
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification token.');
    } finally {
      setBusy(false);
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
          <Link
            to="/register"
            className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Register
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl text-gray-800 text-center mb-6">
            {requires2FA ? 'Security Verification' : 'Sign In'}
          </h2>

          <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">

            {!requires2FA ? (
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

                <Captcha value={captcha} onChange={setCaptcha} refreshKey={captchaKey} />
              </>
            ) : (
              <div className="animate-fade-in">
                <div className="flex justify-center mb-4 text-blue-600">
                  <Lock className="w-12 h-12" />
                </div>
                <p className="text-sm text-gray-600 text-center mb-4">
                  A unique 2FA verification code has been dispatched to your registered mobile number. Please input the 6-digit code below to finalize your authentication.
                </p>
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
                    className="w-full text-center tracking-widest text-2xl font-bold px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000000"
                  />
                </div>

                {/* Secure Resend Handler */}
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={cooldown > 0 || busy}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${busy && 'animate-spin'}`} />
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend SMS Verification'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
            >
              {busy ? 'Processing…' : requires2FA ? 'Verify Code' : 'Sign In'}
            </button>

            {requires2FA && (
              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setOtp('');
                  setError('');
                  // SECURITY FIX: Wipe credentials when backing out
                  setUsername('');
                  setPassword('');
                  setCaptcha('');
                  setCaptchaKey((k) => k + 1); // Generates a fresh captcha
                }}
                className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
              >
                Back to Sign In
              </button>
            )}
          </form>

          {!requires2FA && (
            <>
              <div className="mt-6 text-center text-sm sm:text-base text-gray-600">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 hover:underline">Register here</Link>
              </div>
              <div className="mt-6 text-center text-sm sm:text-base text-gray-600">
                <Link to="/reset-password" className="text-blue-600 hover:underline text-sm">
                  Forgot password?
                </Link>
              </div>
              <div className="mt-4 text-center text-xs text-gray-500">
                <Link to="/admin/login" className="hover:underline">Admin sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}