import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/client';
import { PATTERNS } from '../utils/format';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    username: '',
    pin: '',
    confirmPin: '',
  });
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // Keep PIN/phone inputs numeric-only as the user types.
  const updateDigits = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value.replace(/\D/g, '') });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (/\d/.test(form.first_name) || /\d/.test(form.last_name))
      return setError('First name and last name cannot contain numbers.');
    if (!PATTERNS.name.test(form.first_name) || !PATTERNS.name.test(form.last_name))
      return setError('Enter a valid first and last name (letters, spaces, hyphens, apostrophes).');
    if (!PATTERNS.email.test(form.email)) return setError('Invalid email address.');
    if (!PATTERNS.phoneSG.test(form.phone_number))
      return setError('Phone number must be exactly 8 digits (no +65 or spaces).');
    if (!PATTERNS.username.test(form.username))
      return setError('Username must start with a letter, 3-50 characters (letters, digits, . _ -).');
    if (!PATTERNS.pin.test(form.pin))
      return setError('PIN must be exactly 6 digits.');
    if (form.pin !== form.confirmPin) return setError('PINs do not match.');

    setBusy(true);
    try {
      await api.post('/auth/register', {
        username: form.username,
        password: form.pin, // the 6-digit PIN is stored/hashed like a password
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number,
      });
      setSuccess('Registration successful! Redirecting to sign in…');
      setTimeout(() => nav('/login', { replace: true }), 1500);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, k: keyof typeof form, type = 'text', extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <div>
      <label className="block text-sm sm:text-base text-gray-700 mb-2">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={update(k)}
        className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...extra}
      />
    </div>
  );

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
          aria-label="Toggle PIN visibility"
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
          <h2 className="text-xl sm:text-2xl text-gray-800 mb-6 text-center">Create Account</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('First Name', 'first_name', 'text', { placeholder: 'John', maxLength: 50 })}
              {field('Last Name', 'last_name', 'text', { placeholder: 'Doe', maxLength: 50 })}
            </div>
            {field('Email', 'email', 'email', { placeholder: 'you@email.com', maxLength: 100 })}
            <div>
              <label className="block text-sm sm:text-base text-gray-700 mb-2">Phone Number</label>
              <input
                type="tel"
                inputMode="numeric"
                value={form.phone_number}
                onChange={updateDigits('phone_number')}
                className="w-full px-4 py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="98765432"
                maxLength={8}
              />
            </div>
            {field('Username', 'username', 'text', { placeholder: 'Choose username', maxLength: 50 })}
            {pinField('PIN', 'pin', '6-digit PIN')}
            {pinField('Confirm PIN', 'confirmPin', 'Re-enter PIN')}

            {error && <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Register'}
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Sign in here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
