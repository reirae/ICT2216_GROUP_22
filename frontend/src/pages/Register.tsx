import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';

type Stage = 'form' | 'otp' | 'success';

export default function Register() {
  const nav = useNavigate();
  const [stage, setStage] = useState<Stage>('form');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    username: '',
    pin: '',
    confirmPin: '',
  });
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const updateDigits = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value.replace(/\D/g, '') });

  // Stage 1: Validate and send OTP
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (/\d/.test(form.first_name) || /\d/.test(form.last_name))
      return setError('First name and last name cannot contain numbers.');
    if (!PATTERNS.name.test(form.first_name) || !PATTERNS.name.test(form.last_name))
      return setError('Enter a valid first and last name.');
    if (!PATTERNS.email.test(form.email))
      return setError('Invalid email address.');
    if (!PATTERNS.phoneSG.test(form.phone_number))
      return setError('Phone number must be exactly 8 digits.');
    if (!PATTERNS.username.test(form.username))
      return setError('Username must start with a letter, 3-50 characters.');
    if (!PATTERNS.pin.test(form.pin))
      return setError('PIN must be exactly 6 digits.');
    if (form.pin !== form.confirmPin)
      return setError('PINs do not match.');

    setBusy(true);
    try {
      await api.post('/auth/register-send-otp', {
        username: form.username,
        password: form.pin,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
      });
      setStage('otp');
      setCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  // Stage 2: Verify OTP
  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!otp || otp.length !== 6) {
      return setError('Please enter a valid 6-digit code.');
    }

    setBusy(true);
    try {
      await api.post('/auth/register-verify-otp', { email: form.email, otp });
      // OTP verified — now create the account
      await api.post('/auth/register', { email: form.email });
      setStage('success');
      setTimeout(() => nav('/login', { replace: true }), 2000);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
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
      await api.post('/auth/register-send-otp', {
        username: form.username,
        password: form.pin,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
      });
      setOtp('');
      setCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setBusy(false);
    }
  };

  const pinField = (label: string, k: 'pin' | 'confirmPin', placeholder: string) => (
    <div>
      <label className="block text-sm sm:text-base text-gray-700 mb-2">{label}</label>
      <div className="relative">
        <input
          type={showPin ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          value={form[k]}
          onChange={updateDigits(k)}
          className="w-full px-4 py-3 pr-12 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={placeholder}
          maxLength={6}
        />
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
        >
          {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 mr-2 sm:mr-3" />
            <h1 className="text-xl sm:text-2xl text-blue-600">SecureBank</h1>
          </div>
          <Link to="/login" className="px-4 sm:px-6 py-2 text-sm sm:text-base bg-white text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50">
            Sign In
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6 sm:p-8">

          {/* STAGE 1 — Registration Form */}
          {stage === 'form' && (
            <>
              <h2 className="text-xl sm:text-2xl text-gray-800 mb-6 text-center">Create Account</h2>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-2">First Name</label>
                    <input type="text" value={form.first_name} onChange={update('first_name')}
                      className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="John" maxLength={50} />
                  </div>
                  <div>
                    <label className="block text-sm sm:text-base text-gray-700 mb-2">Last Name</label>
                    <input type="text" value={form.last_name} onChange={update('last_name')}
                      className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Doe" maxLength={50} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Email</label>
                  <input type="email" value={form.email} onChange={update('email')}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@email.com" maxLength={100} />
                </div>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Phone Number</label>
                  <input type="tel" inputMode="numeric" value={form.phone_number} onChange={updateDigits('phone_number')}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="98765432" maxLength={8} />
                </div>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2">Username</label>
                  <input type="text" value={form.username} onChange={update('username')}
                    className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Choose username" maxLength={50} />
                </div>
                {pinField('PIN', 'pin', '6-digit PIN')}
                {pinField('Confirm PIN', 'confirmPin', 'Re-enter PIN')}

                {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

                <button type="submit" disabled={busy}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {busy ? 'Sending code…' : 'Continue'}
                </button>
              </form>
              <div className="mt-6 text-center text-sm text-gray-600">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 hover:underline">Sign in here</Link>
              </div>
            </>
          )}

          {/* STAGE 2 — OTP Verification */}
          {stage === 'otp' && (
            <>
              <h2 className="text-xl sm:text-2xl text-gray-800 mb-6 text-center">Verify Your Email</h2>
              <form onSubmit={onVerifyOtp} className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  A 6-digit verification code has been sent to{' '}
                  <span className="font-medium text-gray-800">{form.email}</span>. Enter it below to complete registration.
                </p>
                <div>
                  <label className="block text-sm sm:text-base text-gray-700 mb-2 font-medium text-center">
                    Verification Code
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
                  <button type="button" onClick={handleResend} disabled={cooldown > 0 || busy}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 flex items-center gap-1">
                    <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
                  </button>
                </div>

                {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center">{error}</div>}

                <button type="submit" disabled={busy || otp.length !== 6}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
                  {busy ? 'Verifying…' : 'Verify & Create Account'}
                </button>

                <button type="button" onClick={() => { setStage('form'); setOtp(''); setError(''); }}
                  className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium">
                  Back
                </button>
              </form>
            </>
          )}

          {/* STAGE 3 — Success */}
          {stage === 'success' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center text-blue-600">
                <Shield className="w-14 h-14" />
              </div>
              <h2 className="text-xl text-gray-800">Account Created!</h2>
              <p className="text-sm text-gray-600">
                Your account has been verified and created. Redirecting you to sign in…
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}