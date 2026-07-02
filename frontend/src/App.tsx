import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext'; // Import useAuth to handle dynamic /admin redirection
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Recipients from './pages/Recipients';
import Transfer from './pages/Transfer';
import Profile from './pages/Profile';
import AdminLogin from './pages/admin/AdminLogin';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminLogs from './pages/admin/AdminLogs';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import ResetPassword from './pages/ResetPassword';
import AdminProvisioning from './pages/admin/AdminProvisioning';
import AdminManagement from './pages/admin/AdminManagement';

// Helper component to resolve the index fallback route securely
function AdminIndexRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/admin/login" replace />;

  const rawRole = user.role as string;
  const usernameLower = user.username.toLowerCase();

  // Handle default contextual fallback normalization
  let effectiveRole = rawRole;
  if (rawRole === 'admin') {
    if (usernameLower.includes('bus') || usernameLower.includes('business')) {
      effectiveRole = 'business_admin';
    } else {
      effectiveRole = 'it_admin';
    }
  }

  if (effectiveRole === 'it_admin') {
    return <Navigate to="/admin/logs" replace />;
  }
  return <Navigate to="/admin/users" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Standard User Streams */}
      <Route
        element={
          <ProtectedRoute role="user">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recipients" element={<Recipients />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Shared Admin Shell Guard */}
      <Route
        element={
          <ProtectedRoute role="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminIndexRedirect />} />
        
        {/* Business Admin Exclusive Views */}
        <Route 
          path="/admin/users" 
          element={
            <ProtectedRoute allowedRoles={['business_admin']}>
              <AdminUsers />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/transactions" 
          element={
            <ProtectedRoute allowedRoles={['business_admin']}>
              <AdminTransactions />
            </ProtectedRoute>
          } 
        />

        {/* IT Admin Exclusive Views */}
        <Route 
          path="/admin/logs" 
          element={
            <ProtectedRoute allowedRoles={['it_admin']}>
              <AdminLogs />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/provision" 
          element={
            <ProtectedRoute allowedRoles={['it_admin']}>
              <AdminProvisioning />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/management" 
          element={
            <ProtectedRoute allowedRoles={['it_admin']}>
              <AdminManagement />
            </ProtectedRoute>
          } 
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}