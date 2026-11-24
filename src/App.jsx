import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import UserVendingHub from './components/vending/UserVendingHub';
import VendingTeam from './pages/VendingTeam';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Syncing Vending Session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route
        path="/vending"
        element={
          <ProtectedRoute>
            <UserVendingHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vending-team"
        element={
          <ProtectedRoute>
            <VendingTeam />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/vending" replace />} />
    </Routes>
  );
}
