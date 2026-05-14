import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
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
    password: '',
    confirm: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!PATTERNS.name.test(form.first_name) || !PATTERNS.name.test(form.last_name))
      return setError('Names may contain letters, spaces, hyphens, and apostrophes.');
    if (!PATTERNS.email.test(form.email)) return setError('Invalid email address.');
    if (form.phone_number && !PATTERNS.phone.test(form.phone_number))
      return setError('Phone must be 8-15 digits, optional + prefix.');
    if (!PATTERNS.username.test(form.username))
      return setError('Username must start with a letter, 3-50 characters (letters, digits, . _ -).');
    if (!PATTERNS.password.test(form.password))
      return setError('Password must be 8+ chars with upper, lower, digit, and symbol.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');

    setBusy(true);
    try {
      await api.post('/auth/register', {
        username: form.username,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone_number: form.phone_number || undefined,
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
            {field('Phone (optional)', 'phone_number', 'tel', { placeholder: '+6598765432', maxLength: 20 })}
            {field('Username', 'username', 'text', { placeholder: 'Choose username', maxLength: 50 })}
            {field('Password', 'password', 'password', { placeholder: 'Min 8 chars, upper/lower/digit/symbol', maxLength: 128 })}
            {field('Confirm Password', 'confirm', 'password', { placeholder: 'Confirm password', maxLength: 128 })}

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
