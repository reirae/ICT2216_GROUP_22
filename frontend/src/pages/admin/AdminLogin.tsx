import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { PATTERNS } from '../../utils/format';

export default function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null)
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

   const resetTurnstile = () => {
    turnstileRef.current?.reset() // ← This resets the widget
    setCaptcha('') // ← Clear the token
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!PATTERNS.username.test(username)) {
      setError('Invalid admin username format.');
      return;
    }
    if (!password) return setError('Password is required.');
    setBusy(true);
    try {
      await login('admin', { username, password, captcha });
      nav('/admin/users', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <header className="bg-gray-950 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 mr-2 sm:mr-3" />
            <h1 className="text-xl sm:text-2xl text-blue-400">SecureBank · Admin</h1>
          </div>
          <Link to="/login" className="px-4 sm:px-6 py-2 text-sm border border-gray-600 rounded-lg hover:bg-gray-800">
            User sign in
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl text-white text-center mb-6">Administrator Sign In</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm sm:text-base mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-sm sm:text-base mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300"
                  aria-label="Toggle password visibility"
                >
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="text-gray-900 bg-gray-50 rounded-lg p-3">
              <Turnstile siteKey={(import.meta as any).env.VITE_CFTS_SITE_KEY!} onSuccess={(token) => setCaptcha(token)} onError={() => setError('Verification failed. Please try again.')} onExpire={() => setCaptcha('')}/>
            </div>

            {error && <div className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{error}</div>}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
