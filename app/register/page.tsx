'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, useAuth } from '../contexts/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: '',
    ownerName: '',
    activityType: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    username: '',
    password: '',
    package: 'bronze',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest('/auth/register-shop', {
        method: 'POST',
        body: JSON.stringify({
          businessName: form.businessName,
          ownerName: form.ownerName,
          activityType: form.activityType,
          address: form.address,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          username: form.username,
          password: form.password,
          package: form.package,
        }),
      });
      await login(form.username, form.password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-[#0b1220] border border-cyan-500/30 rounded-2xl p-8 space-y-5"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-cyan-200">Create your ERP account</h1>
          <p className="text-sm text-slate-400">Set up your business profile in minutes</p>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-500/40 rounded p-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Business name"
            value={form.businessName}
            onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
            required
          />
          <input
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Business owner name"
            value={form.ownerName}
            onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))}
          />
          <input
            list="activity-types"
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Activity type"
            value={form.activityType}
            onChange={(e) => setForm((prev) => ({ ...prev, activityType: e.target.value }))}
            required
          />
          <datalist id="activity-types">
            <option value="Auto Parts" />
            <option value="Supermarket" />
            <option value="Pharmacy" />
            <option value="Cafe" />
            <option value="Computer Shop" />
            <option value="Clothing" />
            <option value="Electronics" />
          </datalist>
          <input
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm md:col-span-2"
            placeholder="Business address"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
          />
          <input
            type="email"
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Contact email"
            value={form.contactEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
          />
          <input
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Contact phone"
            value={form.contactPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
          />
          <input
            type="email"
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Login email"
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            required
          />
          <input
            type="password"
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          <select
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
            value={form.package}
            onChange={(e) => setForm((prev) => ({ ...prev, package: e.target.value }))}
          >
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <Link href="/login" className="hover:text-cyan-300">
            Already have an account?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm disabled:opacity-60"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </main>
  );
}
