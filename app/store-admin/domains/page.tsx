'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '../../components/Sidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiRequest, useAuth } from '../../contexts/AuthContext';

type DomainStatus = 'pending' | 'verified' | 'active' | 'inactive';
type VerificationMethod = 'txt' | 'cname';

type DomainRow = {
  id: number;
  domain: string;
  status: DomainStatus;
  is_active: number;
  verification_method: VerificationMethod;
  verification_token: string;
  verified_at: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

type DomainsResponse = {
  config: {
    verifyRecordPrefix: string;
    cnameRoot: string;
  };
  domains: DomainRow[];
};

export default function StoreDomainsPage() {
  const { direction, language, t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [shopProfile, setShopProfile] = useState<any>(null);
  const [cfg, setCfg] = useState<{ verifyRecordPrefix: string; cnameRoot: string }>({
    verifyRecordPrefix: '_crown-verify',
    cnameRoot: 'verify.crowncs.org',
  });

  const [form, setForm] = useState<{ domain: string; method: VerificationMethod }>({
    domain: '',
    method: 'txt',
  });

  const isAllowed = user?.role === 'super_admin' || user?.role === 'shop_owner';

  const slugify = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shop';

  const recordNameFor = useMemo(() => {
    return (domainValue: string) => `${cfg.verifyRecordPrefix}.${domainValue}`;
  }, [cfg.verifyRecordPrefix]);

  const recordValueFor = useMemo(() => {
    return (row: Pick<DomainRow, 'verification_method' | 'verification_token'>) => {
      if (row.verification_method === 'cname') {
        return `${row.verification_token}.${cfg.cnameRoot}`;
      }
      return `crown-site-verification=${row.verification_token}`;
    };
  }, [cfg.cnameRoot]);

  const loadDomains = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = (await apiRequest('/domains')) as DomainsResponse;
      setCfg(data.config);
      setDomains(data.domains || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const loadShopProfile = async () => {
    try {
      const data = await apiRequest('/shops/profile');
      setShopProfile(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    loadShopProfile();
    loadDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed]);

  const addDomain = async () => {
    setError(null);
    const domain = form.domain.trim();
    if (!domain) return;
    try {
      setSaving(true);
      await apiRequest('/domains/add', {
        method: 'POST',
        body: JSON.stringify({
          domain,
          verificationMethod: form.method,
        }),
      });
      setForm({ domain: '', method: form.method });
      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Failed to add domain');
    } finally {
      setSaving(false);
    }
  };

  const verifyDomain = async (domain: string) => {
    setError(null);
    try {
      setSaving(true);
      await apiRequest('/domains/verify', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setSaving(false);
    }
  };

  const activateDomain = async (domain: string) => {
    setError(null);
    try {
      setSaving(true);
      await apiRequest('/domains/activate', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Activation failed');
    } finally {
      setSaving(false);
    }
  };

  const deactivateDomain = async (domain: string) => {
    setError(null);
    try {
      setSaving(true);
      await apiRequest('/domains/deactivate', {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Deactivation failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-black text-white flex" dir={direction}>
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="neon-card rounded-xl p-6">
            <div className="text-red-200">{language === 'ar' ? 'غير مصرح' : 'Unauthorized'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-cyan-200">
            {language === 'ar' ? 'إدارة الدومينات' : 'Domain Management'}
          </h1>
          <button
            type="button"
            onClick={() => {
              const id = Number(shopProfile?.id || 0);
              if (!id || typeof window === 'undefined') return;
              const name = shopProfile?.business_name || shopProfile?.name || 'shop';
              const slug = slugify(String(name));
              window.open(`/store/${id}-${slug}`, '_blank', 'noopener,noreferrer');
            }}
            className="px-4 py-2 rounded-xl border border-cyan-500/40 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/15 text-sm font-semibold"
            disabled={!shopProfile?.id}
            title={language === 'ar' ? 'معاينة المتجر قبل تفعيل الدومين' : 'Preview store before domain activation'}
          >
            👁️ {language === 'ar' ? 'معاينة المتجر' : 'Preview Store'}
          </button>
        </div>

        <div className="neon-card rounded-xl p-6 mb-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">
                {language === 'ar' ? 'الدومين' : 'Domain'}
              </label>
              <input
                className="w-full bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                placeholder="example.com"
                value={form.domain}
                onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {language === 'ar' ? 'طريقة التحقق' : 'Verification'}
              </label>
              <select
                className="w-full bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                value={form.method}
                onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value as VerificationMethod }))}
              >
                <option value="txt">TXT</option>
                <option value="cname">CNAME</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={addDomain}
              disabled={saving || !form.domain.trim()}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold disabled:opacity-50"
            >
              {saving ? t('common.loading') : language === 'ar' ? 'إضافة دومين' : 'Add domain'}
            </button>
          </div>
        </div>

        <div className="neon-card rounded-xl p-6">
          {loading ? (
            <div className="text-sm text-slate-300">{t('common.loading')}</div>
          ) : domains.length === 0 ? (
            <div className="text-sm text-slate-400">
              {language === 'ar' ? 'لا توجد دومينات' : 'No domains yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-cyan-400 border-b border-cyan-500/20">
                  <tr>
                    <th className="py-2 text-left">{language === 'ar' ? 'الدومين' : 'Domain'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'DNS' : 'DNS'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'إجراء' : 'Action'}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {domains.map((row) => {
                    const active = Number(row.is_active) === 1 && row.status === 'active';
                    const recordName = recordNameFor(row.domain);
                    const recordValue = recordValueFor(row);
                    const type = row.verification_method === 'cname' ? 'CNAME' : 'TXT';

                    return (
                      <tr key={row.id} className="border-b border-cyan-500/10 align-top">
                        <td className="py-3">
                          <div className="font-semibold text-white">{row.domain}</div>
                          <div className="text-xs text-slate-400">
                            {language === 'ar' ? 'مضاف:' : 'Added:'}{' '}
                            {row.created_at ? new Date(row.created_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                          </div>
                        </td>
                        <td className="py-3">
                          <div
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${
                              active
                                ? 'border-green-500/40 bg-green-500/10 text-green-200'
                                : row.status === 'verified'
                                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                                  : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
                            }`}
                          >
                            {row.status}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="text-xs text-slate-300">
                            <div className="text-cyan-200 font-semibold">{type}</div>
                            <div className="mt-1">
                              <div className="text-slate-400">{language === 'ar' ? 'الاسم:' : 'Name:'}</div>
                              <div className="break-all">{recordName}</div>
                            </div>
                            <div className="mt-2">
                              <div className="text-slate-400">{language === 'ar' ? 'القيمة:' : 'Value:'}</div>
                              <div className="break-all">{recordValue}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => verifyDomain(row.domain)}
                              disabled={saving}
                              className="px-3 py-2 rounded-lg border border-cyan-500/40 text-cyan-200 text-xs hover:bg-cyan-500/10 disabled:opacity-50"
                            >
                              {language === 'ar' ? 'تحقق' : 'Verify'}
                            </button>
                            <button
                              onClick={() => activateDomain(row.domain)}
                              disabled={saving || active}
                              className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs hover:bg-cyan-500 disabled:opacity-50"
                            >
                              {language === 'ar' ? 'تفعيل' : 'Activate'}
                            </button>
                            <button
                              onClick={() => deactivateDomain(row.domain)}
                              disabled={saving || !active}
                              className="px-3 py-2 rounded-lg border border-red-500/40 text-red-200 text-xs hover:bg-red-500/10 disabled:opacity-50"
                            >
                              {language === 'ar' ? 'إيقاف' : 'Deactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

