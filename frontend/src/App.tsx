import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Storefront } from './pages/Storefront';
import { FloatingAIAssistant } from './components/FloatingAIAssistant';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import './index.css';

const PrivateRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ 
  children, 
  allowedRoles 
}) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-cyan-400">Loading...</div>
    </div>;
  }

  if (!user) {
    return <Navigate to="/dashboard" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route 
        path="/dashboard" 
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } 
      />
      <Route 
        path="/pos" 
        element={
          <PrivateRoute allowedRoles={['super_admin', 'shop_owner', 'cashier']}>
            <POS />
          </PrivateRoute>
        } 
      />
      <Route path="/storefront/:shopId" element={<Storefront />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <div className="relative">
            <div className="fixed top-4 right-4 z-50">
              <LanguageSwitcher />
            </div>
            <AppRoutes />
            <FloatingAIAssistant />
          </div>
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
