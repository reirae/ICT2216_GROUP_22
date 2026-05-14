import { Navigate, Route, Routes } from 'react-router-dom';
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin/login" element={<AdminLogin />} />

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

      <Route
        element={
          <ProtectedRoute role="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/transactions" element={<AdminTransactions />} />
        <Route path="/admin/logs" element={<AdminLogs />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
