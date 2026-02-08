'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../contexts/AuthContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(result.message || 'If an account exists, a reset link will be sent.');
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#0b1220] border border-cyan-500/30 rounded-2xl p-8 space-y-5"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-cyan-200">Reset your password</h1>
          <p className="text-sm text-slate-400">We will email you a secure reset link.</p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/40 rounded p-2">
            {error}
          </div>
        )}
        {message && (
          <div className="text-sm text-green-300 bg-green-900/20 border border-green-500/40 rounded p-2">
            {message}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm text-gray-300">Email</label>
          <input
            type="email"
            className="w-full rounded bg-[#0f172a] border border-cyan-500/20 px-3 py-2 text-sm focus:outline-none focus:border-cyan-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm disabled:opacity-60"
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>

        <div className="text-xs text-slate-400 text-center">
          <Link href="/login" className="hover:text-cyan-300">
            Back to login
          </Link>
        </div>
      </form>
    </main>
  );
}
