'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiRequest, useAuth } from '../../../contexts/AuthContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { Sidebar } from '../../../components/Sidebar';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SlowMovingItem {
  productId: number;
  name: string;
  nameAr?: string;
  sku: string;
  category?: string;
  stock: number;
  price: number;
  costPrice?: number | null;
  tiedValue: number;
  lastSoldAt: string | null;
  soldQtyWindow: number;
  daysSinceLastSale: number | null;
  bucket: string;
  suggestedDiscountPct: number | null;
  recommendationAr: string;
  recommendationEn: string;
}

interface Summary {
  ok: boolean;
  days: number;
  threshold: number;
  deadCount: number;
  slowCount: number;
  deadValue: number;
  slowValue: number;
  bucketCounts?: Record<string, number>;
}

function exportToCSV(rows: string[][], filename: string) {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const BUCKET_LABELS: Record<string, { ar: string; en: string }> = {
  '0_30': { ar: '0-30 يوم', en: '0-30 days' },
  '31_90': { ar: '31-90 يوم', en: '31-90 days' },
  '91_180': { ar: '91-180 يوم', en: '91-180 days' },
  '180_plus': { ar: '180+ يوم', en: '180+ days' },
  'never_sold': { ar: 'لم يباع', en: 'Never sold' },
};

export default function SlowMovingPage() {
  const { t, language, direction } = useLanguage();
  const { user } = useAuth();
  const { format } = useCurrency();
  const [type, setType] = useState<'all' | 'dead' | 'slow'>('all');
  const [days, setDays] = useState(120);
  const [threshold, setThreshold] = useState(2);
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<SlowMovingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        type,
        days: String(days),
        threshold: String(threshold),
        limit: '100',
        offset: '0',
      });
      if (q.trim()) params.set('q', q.trim());
      if (bucket) params.set('bucket', bucket);
      const [summaryRes, listRes] = await Promise.all([
        apiRequest(`/admin/inventory/slow-moving/summary?days=${days}&threshold=${threshold}`),
        apiRequest(`/admin/inventory/slow-moving?${params.toString()}`),
      ]);
      setSummary(summaryRes as Summary);
      setItems((listRes as { items?: SlowMovingItem[] })?.items ?? []);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [type, days, threshold, q, bucket]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  const handleExportCSV = () => {
    const rows: string[][] = [
      [language === 'ar' ? 'المنتج' : 'Product', language === 'ar' ? 'SKU' : 'SKU', language === 'ar' ? 'المخزون' : 'Stock', language === 'ar' ? 'القيمة المربوطة' : 'Tied Value', language === 'ar' ? 'آخر بيع' : 'Last Sold', language === 'ar' ? 'الكمية المباعة' : 'Sold Qty', language === 'ar' ? 'التوصية' : 'Recommendation'],
      ...items.map((it) => [
        language === 'ar' ? it.nameAr || it.name : it.name,
        it.sku || '',
        String(it.stock),
        format(it.tiedValue),
        it.lastSoldAt || '-',
        String(it.soldQtyWindow),
        language === 'ar' ? it.recommendationAr : it.recommendationEn,
      ]),
    ];
    exportToCSV(rows, `dead-slow-stock-${days}d-${threshold}t.csv`);
  };

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <h1 className="text-2xl font-bold text-cyan-200 mb-6">{t('nav.slowMoving')}</h1>

        {/* KPI tile */}
        {summary?.ok && (
          <div className="p-6 neon-card rounded-xl border border-amber-500/40 mb-6">
            <p className="text-sm text-gray-400 mb-2">{language === 'ar' ? 'الراكد/البطيء' : 'Dead/Slow Stock'}</p>
            <div className="flex flex-wrap gap-6">
              <span className="text-xl font-bold text-red-400">{language === 'ar' ? 'راكد' : 'Dead'}: {summary.deadCount}</span>
              <span className="text-xl font-bold text-amber-400">{language === 'ar' ? 'بطيء' : 'Slow'}: {summary.slowCount}</span>
              <span className="text-lg text-cyan-300">{language === 'ar' ? 'القيمة المربوطة' : 'Tied Value'}: {format(summary.deadValue + summary.slowValue)}</span>
              <span className="text-xs text-gray-500">Window: {days}d | Threshold: {threshold}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6 print:hidden">
          <div className="flex gap-2">
            {(['all', 'dead', 'slow'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setType(tab)}
                className={`px-4 py-2 rounded-lg ${type === tab ? 'bg-cyan-500/30 border-cyan-500' : 'border border-cyan-500/40'} text-cyan-300`}
              >
                {tab === 'all' ? (language === 'ar' ? 'الكل' : 'All') : tab === 'dead' ? (language === 'ar' ? 'راكد' : 'Dead') : (language === 'ar' ? 'بطيء' : 'Slow')}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200"
          >
            <option value={120}>120 {language === 'ar' ? 'يوم' : 'days'} (4 {language === 'ar' ? 'أشهر' : 'months'})</option>
            <option value={90}>90 {language === 'ar' ? 'يوم' : 'days'}</option>
            <option value={180}>180 {language === 'ar' ? 'يوم' : 'days'}</option>
          </select>
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200"
          >
            <option value={2}>2</option>
            <option value={1}>1</option>
            <option value={3}>3</option>
          </select>
          <input
            type="text"
            placeholder={language === 'ar' ? 'بحث بالاسم أو SKU' : 'Search name/SKU'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200 w-48"
          />
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200"
          >
            <option value="">{language === 'ar' ? 'كل الفترات' : 'All buckets'}</option>
            {Object.entries(BUCKET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{language === 'ar' ? v.ar : v.en}</option>
            ))}
          </select>
          <button onClick={handleExportCSV} disabled={items.length === 0} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50">
            Export CSV
          </button>
          <button onClick={handlePrint} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
            Print
          </button>
        </div>

        {error && <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">{error}</div>}

        {/* Table */}
        <div className="p-6 neon-card rounded-xl overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-gray-500">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-500">{language === 'ar' ? 'لا توجد منتجات راكدة/بطيئة' : 'No dead/slow products'}</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700 text-cyan-500">
                  <th className="pb-3 pr-2 w-8"></th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'المنتج' : 'Product'}</th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'SKU' : 'SKU'}</th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'المخزون' : 'Stock'}</th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'القيمة المربوطة' : 'Tied Value'}</th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'آخر بيع' : 'Last Sold'}</th>
                  <th className="pb-3 pr-4">{language === 'ar' ? 'الكمية المباعة' : 'Sold (window)'}</th>
                  <th className="pb-3">{language === 'ar' ? 'الفترة' : 'Bucket'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <React.Fragment key={it.productId}>
                    <tr
                      className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === it.productId ? null : it.productId)}
                    >
                      <td className="py-3 pr-2">{expandedId === it.productId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="py-3 pr-4">{language === 'ar' ? it.nameAr || it.name : it.name}</td>
                      <td className="py-3 pr-4 text-gray-400">{it.sku || '-'}</td>
                      <td className="py-3 pr-4">{it.stock}</td>
                      <td className="py-3 pr-4 text-cyan-300 font-semibold">{format(it.tiedValue)}</td>
                      <td className="py-3 pr-4 text-gray-400">{it.lastSoldAt ? new Date(it.lastSoldAt).toLocaleDateString() : '-'}</td>
                      <td className="py-3 pr-4">{it.soldQtyWindow}</td>
                      <td className="py-3">{BUCKET_LABELS[it.bucket] ? (language === 'ar' ? BUCKET_LABELS[it.bucket].ar : BUCKET_LABELS[it.bucket].en) : it.bucket}</td>
                    </tr>
                    {expandedId === it.productId && (
                      <tr className="border-b border-gray-800 bg-gray-800/30">
                        <td colSpan={8} className="py-4 px-4">
                          <div className="text-sm">
                            <p className="text-cyan-300 mb-1">{language === 'ar' ? 'التوصية' : 'Recommendation'}:</p>
                            <p>{language === 'ar' ? it.recommendationAr : it.recommendationEn}</p>
                            {it.suggestedDiscountPct != null && (
                              <p className="mt-2 text-amber-400">{language === 'ar' ? 'اقتراح خصم' : 'Suggested discount'}: {it.suggestedDiscountPct}%</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
