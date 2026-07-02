import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  Home, CreditCard, Users, Settings, LogOut, Menu, X, Shield, TrendingUp, ScrollText, UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Item { to: string; label: string; icon: any }

const userItems: Item[] = [
  { to: '/dashboard',    label: 'Dashboard',      icon: Home },
  { to: '/transactions', label: 'Transactions',   icon: TrendingUp },
  { to: '/recipients',   label: 'Recipients',     icon: Users },
  { to: '/transfer',     label: 'Transfer Funds', icon: CreditCard },
  { to: '/profile',      label: 'Profile',        icon: Settings },
];

const businessAdminItems: Item[] = [
  { to: '/admin/users',        label: 'User Management',     icon: Users },
  { to: '/admin/transactions', label: 'All Transactions',    icon: TrendingUp },
];

const itAdminItems: Item[] = [
  { to: '/admin/logs',         label: 'Audit Logs',          icon: ScrollText },
  { to: '/admin/provision',    label: 'Provision Admin',     icon: UserPlus },
  { to: '/admin/management',   label: 'Admin Directory',     icon: Users },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  
  if (!user) return null;

  let items: Item[] = userItems;
  const rawRole = user.role as string;
  const usernameLower = user.username.toLowerCase();

  // Normalize generic administrative role values based on username context patterns
  let effectiveRole = rawRole;
  if (rawRole === 'admin') {
    if (usernameLower.includes('bus') || usernameLower.includes('business')) {
      effectiveRole = 'business_admin';
    } else {
      effectiveRole = 'it_admin';
    }
  }

  const isAdminGroup = effectiveRole === 'business_admin' || effectiveRole === 'it_admin';

  // Strict structural routing separation based on the resolved effective admin role
  if (effectiveRole === 'business_admin') {
    items = businessAdminItems;
  } else if (effectiveRole === 'it_admin') {
    items = itAdminItems;
  } else {
    items = userItems;
  }

  const handleLogout = async () => {
    await logout();
    nav(isAdminGroup ? '/admin/login' : '/login', { replace: true });
  };

  const displayName = user.first_name || user.last_name
    ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    : user.username;

  // Formatter to map raw type tokens into pristine client-facing text labels
  const getDisplayRoleName = (roleStr: string) => {
    if (roleStr === 'business_admin') return 'Business Admin';
    if (roleStr === 'it_admin') return 'IT Admin';
    return roleStr.toUpperCase();
  };

  return (
    <>
      {/* Mobile Header view */}
      <div className="lg:hidden bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center">
          <Shield className="w-8 h-8 mr-2" />
          <span className="text-xl">SecureBank</span>
        </div>
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Desktop & Mobile Sidebar Menu */}
      <aside
        className={`${open ? 'block' : 'hidden'} lg:block fixed lg:sticky top-0 left-0 h-screen w-72 bg-white shadow-lg z-40 flex flex-col`}
      >
        <div className="flex-shrink-0 p-6 hidden lg:block">
          <div className="flex items-center mb-8">
            <Shield className="w-10 h-10 text-blue-600 mr-3" />
            <h1 className="text-2xl text-blue-600">SecureBank</h1>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-4 border-t border-gray-100 pt-4"
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span>Logout</span>
          </button>
        </nav>

        <div className="flex-shrink-0 p-4 pb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Logged in as:</p>
            <p className="text-gray-800 font-medium break-words">{displayName}</p>
            
            {isAdminGroup ? (
              <>
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  Admin ID: {user.admin_id || user.id || '—'}
                </p>
                <p className="text-[11px] tracking-wider text-blue-600 font-bold uppercase mt-1">
                  ROLE: {getDisplayRoleName(effectiveRole)}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  User ID: {user.user_id || user.id || '—'}
                </p>
                {user.account_number && (
                  <p className="text-xs text-gray-500 mt-0.5 break-words font-mono">
                    Acc: {user.account_number}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}