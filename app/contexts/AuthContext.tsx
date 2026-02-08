'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiUrl } from '../api-config';

/** Controlled error when session is invalid (401/403) - app should redirect to login, not crash */
export class AuthError extends Error {
  constructor(message = 'Session expired') {
    super(message);
    this.name = 'AuthError';
  }
}

interface User {
  id: number;
  username: string;
  role: 'super_admin' | 'shop_owner' | 'cashier' | 'warehouse';
  package: 'bronze' | 'silver' | 'gold';
  shopId?: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (roles: string[]) => boolean;
  hasPackage: (packages: string[]) => boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Called by apiRequest on 401/403; registered by AuthProvider */
let onAuthFailure: (() => void) | null = null;
export function registerAuthFailureHandler(handler: (() => void) | null) {
  onAuthFailure = handler;
}

function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logoutAndRedirect = useCallback(() => {
    setToken(null);
    setUser(null);
    clearStoredAuth();
    window.location.assign('/login');
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(logoutAndRedirect);
    return () => registerAuthFailureHandler(null);
  }, [logoutAndRedirect]);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch {
        clearStoredAuth();
        setLoading(false);
        return;
      }
    } else {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const refreshUser = async () => {
      try {
        const response = await fetch(apiUrl('/auth/me'), {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`,
          },
        });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setToken(null);
          setUser(null);
          clearStoredAuth();
          setLoading(false);
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (data?.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
          }
        }
      } catch {
        // ignore network errors on initial check
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refreshUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string) => {
    const response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const raw = await response.text();
    if (!response.ok) {
      try {
        const error = JSON.parse(raw);
        throw new Error(error.error || 'Login failed');
      } catch {
        throw new Error(raw || 'Login failed');
      }
    }

    const data = raw ? JSON.parse(raw) : {};
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearStoredAuth();
  };

  const hasRole = (roles: string[]): boolean => {
    return user ? roles.includes(user.role) : false;
  };

  const hasPackage = (packages: string[]): boolean => {
    return user ? packages.includes(user.package) : false;
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasRole, hasPackage, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');
  const userObj = storedUser ? JSON.parse(storedUser) : null;
  const shopId = userObj?.shopId ?? userObj?.shop_id ?? null;

  const response = await fetch(apiUrl(url), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(shopId && { 'x-shop-id': String(shopId) }),
      ...options.headers,
    },
  });

  const raw = await response.text();

  if (response.status === 401 || response.status === 403) {
    clearStoredAuth();
    onAuthFailure?.();
    throw new AuthError('Session expired. Please sign in again.');
  }

  if (!response.ok) {
    let errorMessage = 'Request failed';
    try {
      const error = raw ? JSON.parse(raw) : {};
      errorMessage = error.error || errorMessage;
    } catch {
      if (raw) errorMessage = raw;
    }
    throw new Error(errorMessage);
  }

  return raw ? JSON.parse(raw) : {};
};
