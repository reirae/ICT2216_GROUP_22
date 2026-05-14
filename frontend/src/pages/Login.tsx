import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Captcha } from '../components/Captcha';
import { PATTERNS } from '../utils/format';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!PATTERNS.username.test(username)) {
      setError('Username must start with a letter and be 3-50 characters (letters, digits, . _ -).');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    setBusy(true);
    try {
      await login('user', { username, password, captcha });
      nav('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setCaptchaKey((k) => k + 1);
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
          <h2 className="text-xl sm:text-2xl text-gray-800 text-center mb-6">Sign In</h2>
          <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
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
                  aria-label="Toggle password visibility"
                >
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Captcha value={captcha} onChange={setCaptcha} refreshKey={captchaKey} />

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm sm:text-base text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:underline">Register here</Link>
          </div>
          <div className="mt-4 text-center text-xs text-gray-500">
            <Link to="/admin/login" className="hover:underline">Admin sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
