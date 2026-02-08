'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#0b1220] border border-cyan-500/30 rounded-2xl p-8 space-y-5 shadow-[0_0_30px_rgba(0,243,255,0.15)]"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-cyan-200">Welcome back</h1>
          <p className="text-sm text-slate-400">Sign in to your Crown ERP account</p>
        </div>
        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/40 rounded p-2">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-sm text-gray-300">Email</label>
          <input
            type="email"
            className="w-full rounded bg-[#0f172a] border border-cyan-500/20 px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-gray-300">Password</label>
          <input
            type="password"
            className="w-full rounded bg-[#0f172a] border border-cyan-500/20 px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <Link href="/forgot-password" className="hover:text-cyan-300">
            Forgot password?
          </Link>
          <Link href="/register" className="hover:text-cyan-300">
            Create account
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

