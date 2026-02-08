'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';

export default function SettingsPage() {
  const { t, direction } = useLanguage();
  const { user } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [profile, setProfile] = useState({
    businessName: '',
    ownerName: '',
    activityType: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    logoUrl: '',
    countryName: '',
    currencyCode: currency,
    currencySymbol: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [subscription, setSubscription] = useState<{ plan: string; createdAt?: string; expiresAt?: string } | null>(null);
  const trialDays = 14;

  const currencyOptions = [
    { country: 'Egypt', code: 'EGP', symbol: 'ج.م' },
    { country: 'Saudi Arabia', code: 'SAR', symbol: 'ر.س' },
    { country: 'United Arab Emirates', code: 'AED', symbol: 'د.إ' },
    { country: 'Kuwait', code: 'KWD', symbol: 'د.ك' },
    { country: 'Qatar', code: 'QAR', symbol: 'ر.ق' },
    { country: 'United States', code: 'USD', symbol: '$' },
    { country: 'United Kingdom', code: 'GBP', symbol: '£' },
    { country: 'European Union', code: 'EUR', symbol: '€' },
    { country: 'Canada', code: 'CAD', symbol: 'C$' },
    { country: 'Australia', code: 'AUD', symbol: 'A$' },
    { country: 'Japan', code: 'JPY', symbol: '¥' },
    { country: 'China', code: 'CNY', symbol: '¥' },
    { country: 'India', code: 'INR', symbol: '₹' },
    { country: 'Turkey', code: 'TRY', symbol: '₺' },
  ];

  useEffect(() => {
    if (!user) return;
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadProfile = async () => {
    try {
      const data = await apiRequest('/shops/profile');
      setProfile({
        businessName: data.business_name || data.name || '',
        ownerName: data.owner_name || '',
        activityType: data.activity_type || '',
        address: data.address || '',
        contactEmail: data.contact_email || '',
        contactPhone: data.contact_phone || '',
        logoUrl: data.logo_url || '',
        countryName: data.country_name || '',
        currencyCode: data.currency_code || currency,
        currencySymbol: data.currency_symbol || '',
      });
      if (data.currency_code) {
        setCurrency(data.currency_code);
      }
      setSubscription({
        plan: data.package || 'bronze',
        createdAt: data.created_at,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    }
  };

  const handleSave = async () => {
    setError(null);
    setMessage(null);
    try {
      setLoading(true);
      await apiRequest('/shops/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      setMessage('Saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-cyan-200">{t('settings.title')}</h1>
            <p className="text-sm text-slate-400 mt-1">Manage Account & Store Data</p>
          </div>
          <button className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300">
            Upgrade / Activate Subscription
          </button>
        </div>
        <div className="neon-card rounded-xl p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
              {message}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Store name"
              value={profile.businessName}
              onChange={(e) => setProfile((prev) => ({ ...prev, businessName: e.target.value }))}
            />
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Full name"
              value={profile.ownerName}
              onChange={(e) => setProfile((prev) => ({ ...prev, ownerName: e.target.value }))}
            />
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Activity type"
              value={profile.activityType}
              onChange={(e) => setProfile((prev) => ({ ...prev, activityType: e.target.value }))}
            />
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Contact email"
              value={profile.contactEmail}
              onChange={(e) => setProfile((prev) => ({ ...prev, contactEmail: e.target.value }))}
            />
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
              placeholder="Phone"
              value={profile.contactPhone}
              onChange={(e) => setProfile((prev) => ({ ...prev, contactPhone: e.target.value }))}
            />
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) {
                    setError('Logo must be <= 500KB');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setProfile((prev) => ({ ...prev, logoUrl: String(reader.result || '') }));
                  };
                  reader.readAsDataURL(file);
                }}
                className="text-xs text-slate-300"
              />
              {profile.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt="Logo" className="h-12 w-12 rounded-md object-cover border border-cyan-500/20" />
              )}
            </div>
            <input
              className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm md:col-span-2"
              placeholder="Address"
              value={profile.address}
              onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
          <label className="block text-sm text-slate-300 mb-2">Country & Currency</label>
          <select
            value={profile.currencyCode}
            onChange={(e) => {
              const option = currencyOptions.find((item) => item.code === e.target.value);
              if (!option) return;
              const code = option.code as typeof currency;
              setProfile((prev) => ({
                ...prev,
                countryName: option.country,
                currencyCode: code,
                currencySymbol: option.symbol,
              }));
              setCurrency(code);
            }}
            className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
          >
            {currencyOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.country} — {option.code} {option.symbol}
              </option>
            ))}
          </select>

          <div className="mt-6 border-t border-cyan-500/20 pt-6">
            <h2 className="text-lg font-bold text-cyan-200 mb-2">Subscription Status</h2>
            <p className="text-sm text-slate-400">
              Plan: {subscription?.plan || 'bronze'} — Contact Support: +20 1202620913
            </p>
            {subscription?.createdAt && (
              <p className="text-xs text-slate-500 mt-1">
                Trial Period: {Math.max(0, trialDays - Math.floor((Date.now() - new Date(subscription.createdAt).getTime()) / (1000 * 60 * 60 * 24)))} days left
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                className="bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                placeholder="Activation code"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
              />
              <button
                onClick={async () => {
                  try {
                    setError(null);
                    setMessage(null);
                    const data = await apiRequest('/activate', {
                      method: 'POST',
                      body: JSON.stringify({ code: activationCode }),
                    });
                    setSubscription((prev) => ({
                      plan: data.plan,
                      createdAt: prev?.createdAt,
                      expiresAt: data.expiresAt,
                    }));
                    setMessage('Subscription updated');
                  } catch (err: any) {
                    setError(err.message || 'Activation failed');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-sm"
              >
                Activate Code
              </button>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 rounded-lg bg-cyan-600 text-white font-semibold"
            >
              {loading ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

