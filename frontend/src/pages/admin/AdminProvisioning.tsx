import { useState } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { PATTERNS } from '../../utils/format';

export default function AdminProvisioning() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Input Validation Checks against system patterns
    if (!PATTERNS.name.test(firstName)) return setError('Invalid first name format.');
    if (!PATTERNS.name.test(lastName)) return setError('Invalid last name format.');
    if (!PATTERNS.email.test(email)) return setError('Invalid email address format.');
    if (!PATTERNS.phone.test(phone)) return setError('Invalid phone number format (e.g. 91234567).');
    if (!PATTERNS.username.test(username)) return setError('Invalid admin username format.');
    if (!PATTERNS.password.test(password)) return setError('Weak password choice.');

    setBusy(true);
    try {
      await api.post('/admin/create-business-admin', { 
        username, 
        password,
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phone
      });
      setSuccess(`Business administrator "${username}" successfully provisioned.`);
      setUsername('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Error occurred.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-800">Provision Business Admin</h1>
        </div>

        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="John"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="manager@securebank.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="91234567"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="john"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 border border-green-300 text-green-700 rounded-lg text-sm">{success}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
            {busy ? 'Provisioning...' : 'Provision Account'}
          </button>
        </form>
      </div>
    </div>
  );
}