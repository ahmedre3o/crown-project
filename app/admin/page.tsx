'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';

interface UserItem {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

export default function AdminPage() {
  const { t, direction, language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'cashier' });
  const [licenseForm, setLicenseForm] = useState({ plan: 'bronze', duration: 'monthly', count: '1' });
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'super_admin') return;
    loadUsers();
  }, [authLoading, user]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const createUser = async () => {
    setError(null);
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ username: '', password: '', role: 'cashier' });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    }
  };

  const deleteUser = async (id: number) => {
    setError(null);
    try {
      await apiRequest(`/users/${id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const generateCodes = async () => {
    setError(null);
    try {
      const result = await apiRequest('/licenses/generate', {
        method: 'POST',
        body: JSON.stringify({
          plan: licenseForm.plan,
          duration: licenseForm.duration,
          count: parseInt(licenseForm.count || '1', 10),
        }),
      });
      setGeneratedCodes(result.codes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to generate codes');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <h1 className="text-2xl font-bold text-cyan-200 mb-6">{t('admin.title')}</h1>
        {authLoading ? (
          <div className="text-sm text-slate-300">{t('common.loading')}</div>
        ) : user?.role !== 'super_admin' ? (
          <div className="neon-card rounded-xl p-6">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {language === 'ar' ? 'هذه الصفحة خاصة بالمدير العام للنظام فقط.' : 'This page is for system administrators only.'}
            </div>
          </div>
        ) : (
          <div className="neon-card rounded-xl p-6">
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="neon-card rounded-xl p-4">
              <div className="text-cyan-200 font-semibold">{t('plan.bronze')}</div>
              <div className="text-slate-400 text-sm">{t('plan.bronze.desc')}</div>
            </div>
            <div className="neon-card rounded-xl p-4">
              <div className="text-cyan-200 font-semibold">{t('plan.silver')}</div>
              <div className="text-slate-400 text-sm">{t('plan.silver.desc')}</div>
            </div>
            <div className="neon-card rounded-xl p-4">
              <div className="text-cyan-200 font-semibold">{t('plan.gold')}</div>
              <div className="text-slate-400 text-sm">{t('plan.gold.desc')}</div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold text-cyan-200 mb-4">
              {language === 'ar' ? 'إدارة المستخدمين' : 'User Management'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input
                className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                placeholder="Email / Username"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              />
              <input
                type="password"
                className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              />
              <select
                className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="shop_owner">{language === 'ar' ? 'مالك' : 'Owner'}</option>
                <option value="cashier">{language === 'ar' ? 'كاشير' : 'Cashier'}</option>
                <option value="warehouse">{language === 'ar' ? 'مخزن' : 'Warehouse'}</option>
              </select>
            </div>
            <button
              onClick={createUser}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold"
            >
              {language === 'ar' ? 'إضافة مستخدم' : 'Add User'}
            </button>

            <div className="mt-4 overflow-x-auto">
              {loading ? (
                <div className="text-sm text-slate-300">{t('common.loading')}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-cyan-400 border-b border-cyan-500/20">
                    <tr>
                      <th className="py-2 text-left">Email</th>
                      <th className="py-2 text-left">{language === 'ar' ? 'الدور' : 'Role'}</th>
                      <th className="py-2 text-left">{language === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
                      <th className="py-2 text-left">{language === 'ar' ? 'إجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id} className="border-b border-cyan-500/10">
                        <td className="py-2">{item.username}</td>
                        <td className="py-2">{item.role}</td>
                        <td className="py-2">
                          {new Date(item.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => deleteUser(item.id)}
                            className="text-red-400 hover:text-red-300 text-xs"
                            disabled={item.id === user?.id}
                          >
                            {language === 'ar' ? 'حذف' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {user?.role === 'super_admin' && (
            <div className="mt-10 border-t border-cyan-500/20 pt-6">
              <h2 className="text-lg font-bold text-cyan-200 mb-4">
                {language === 'ar' ? 'مولد الأكواد' : 'Activation Code Generator'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                  value={licenseForm.plan}
                  onChange={(e) => setLicenseForm((prev) => ({ ...prev, plan: e.target.value }))}
                >
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
                <select
                  className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                  value={licenseForm.duration}
                  onChange={(e) => setLicenseForm((prev) => ({ ...prev, duration: e.target.value }))}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="lifetime">Lifetime</option>
                </select>
                <input
                  className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                  placeholder="Count"
                  value={licenseForm.count}
                  onChange={(e) => setLicenseForm((prev) => ({ ...prev, count: e.target.value }))}
                />
              </div>
              <button
                onClick={generateCodes}
                className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold"
              >
                {language === 'ar' ? 'توليد الأكواد' : 'Generate Codes'}
              </button>
              {generatedCodes.length > 0 && (
                <div className="mt-4 rounded-lg border border-cyan-500/30 bg-[#0f172a] p-3 text-sm text-cyan-200">
                  {generatedCodes.map((code) => (
                    <div key={code}>{code}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}

