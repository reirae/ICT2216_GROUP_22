import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Mail, RefreshCw, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useRef } from 'react'

type Stage = 'email' | 'otp' | 'newPassword' | 'success';

export default function ResetPassword() {
  const nav = useNavigate();

  //Captcha
  const turnstileRef = useRef<TurnstileInstance>(null)
  const [captcha, setCaptcha] = useState('');

  // Stage control
  const [stage, setStage] = useState<Stage>('email');

  // Email stage
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');

  // OTP stage
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // New password stage
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Shared
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const resetTurnstile = () => {
    turnstileRef.current?.reset() // ← This resets the widget
    setCaptcha('') // ← Clear the token
  }

  // Stage 1: Check email exists, send OTP
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!PATTERNS.email.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      // Check if email exists in the database
      const res = await api.post<{ exists: boolean; username: string }>(
        '/auth/check-email',
        { email }
      );

      if (!res.exists) {
        setError('No account found with that email address.');
        return;
      }

      setUsername(res.username);

      // Send OTP to that email
      await api.post('/auth/email-send-otp', { email, captcha, username: res.username });

      setStage('otp');
      setCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Stage 2: Verify OTP
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/email-verify-otp', { email, otp });
      setStage('newPassword');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/email-send-otp', { email, username });
      setOtp('');
      setCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setBusy(false);
    }
  };

  // Stage 3: Set new password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!PATTERNS.password.test(newPassword)) {
      setError('Password too weak. Use at least 8 characters with uppercase, lowercase, number, and symbol.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { email, newPassword });
      setStage('success');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const stageTitles: Record<Stage, string> = {
    email: 'Reset Password',
    otp: 'Check Your Email',
    newPassword: 'Set New Password',
    success: 'Password Reset',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header — identical to Login */}
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
            {stageTitles[stage]}
          </h2>

          {/* STAGE 1 — Email */}
          {stage === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Enter your registered email address and we'll send you a verification code.
              </p>
              <div>
                <label className="block text-sm sm:text-base text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your email"
                    maxLength={255}
                  />
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
                  {error}
                </div>
              )}

              <Turnstile siteKey={(import.meta as any).env.VITE_CFTS_SITE_KEY!} onSuccess={(token) => setCaptcha(token)} onError={() => setError('Verification failed. Please try again.')} onExpire={() => setCaptcha('')}/>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {busy ? 'Checking…' : 'Send Verification Code'}
              </button>

              <div className="text-center text-sm text-gray-600">
                Remember your password?{' '}
                <Link to="/login" className="text-blue-600 hover:underline">
                  Sign in
                </Link>
              </div>
            </form>
          )}

          {/* STAGE 2 — OTP */}
          {stage === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                A 6-digit verification code has been sent to{' '}
                <span className="font-medium text-gray-800">{email}</span>. Enter it below to continue.
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

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || busy}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
                </button>
              </div>

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
                {busy ? 'Verifying…' : 'Verify Code'}
              </button>

              <button
                type="button"
                onClick={() => { setStage('email'); setOtp(''); setError(''); }}
                className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
              >
                Back
              </button>
            </form>
          )}

          {/* STAGE 3 — New Password */}
          {stage === 'newPassword' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Hi <span className="font-medium text-gray-800">{username}</span>, choose a strong new password for your account.
              </p>

              <div>
                <label className="block text-sm sm:text-base text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter new password"
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

              <div>
                <label className="block text-sm sm:text-base text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Confirm new password"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

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
                {busy ? 'Saving…' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* STAGE 4 — Success */}
          {stage === 'success' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center text-blue-600">
                <CheckCircle className="w-14 h-14" />
              </div>
              <p className="text-gray-700 text-sm">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <button
                onClick={() => nav('/login')}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}