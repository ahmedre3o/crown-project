'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DayPicker } from 'react-day-picker';
import { exportReportToCSV, exportReportToExcel, exportReportToPDF } from '../../components/reportExport';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiRequest, useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Sidebar } from '../../components/Sidebar';
import Link from 'next/link';
import { Calendar } from 'lucide-react';

interface ReportSummary {
  ok: boolean;
  range: { from: string; to: string };
  sales: {
    totalRevenue: number;
    ordersCount: number;
    avgOrderValue: number;
    posRevenue: number;
    onlineRevenueConfirmed: number;
    onlineOrdersConfirmedCount: number;
    statusBreakdown?: { pending: number; confirmed: number; completed: number; cancelled: number };
  };
  profit: { available: boolean; totalProfit?: number; profitNoteAr?: string; profitNoteEn?: string };
  charts: {
    dailyRevenue: Array<{ date: string; pos: number; onlineConfirmed: number; total: number }>;
    dailyProfit?: Array<{ date: string; profit: number }>;
  };
  topProducts: Array<{ productId: number; name: string; sku: string; qty: number; revenue: number; source: string }>;
}

function formatDateStr(dateString: string, lang: string) {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' }).format(d);
}

export default function ReportsCenterPage() {
  const { t, language, direction } = useLanguage();
  const { user } = useAuth();
  const { format } = useCurrency();
  const printAreaRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState<'all' | 'pos' | 'online'>('all');
  const [data, setData] = useState<ReportSummary | null>(null);
  const [transactions, setTransactions] = useState<Array<{ id: string; type: string; date: string; total: number; status?: string; publicCode?: string }>>([]);
  const [deadStockData, setDeadStockData] = useState<{ ok?: boolean; summary?: any; items?: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);
  const [group, setGroup] = useState<'day' | 'week' | 'month'>('day');

  const validateDates = useCallback(() => {
    if (from && to && from > to) {
      setDateValidationError(language === 'ar' ? 'يجب أن يكون تاريخ البداية قبل أو يساوي تاريخ النهاية' : 'Start date must be before or equal to end date');
      return false;
    }
    setDateValidationError(null);
    return true;
  }, [from, to, language]);

  const loadData = useCallback(async () => {
    if (!validateDates()) return;
    try {
      setLoading(true);
      setError(null);
      setDateValidationError(null);
      const [summaryRes, transRes, deadRes] = await Promise.all([
        apiRequest(`/admin/reports/summary?from=${from}&to=${to}&source=${source}&bucket=${group}`),
        apiRequest(`/admin/reports/transactions?from=${from}&to=${to}&source=${source}&limit=500`).catch(() => ({ ok: true, items: [] })),
        apiRequest(`/admin/reports/dead-stock?days=120&threshold=2`).catch(() => ({ ok: false })),
      ]);
      setData(summaryRes as ReportSummary);
      setTransactions((transRes as { items?: any[] })?.items ?? []);
      setDeadStockData(deadRes as any);
    } catch (e: unknown) {
      setError(String((e as Error)?.message || 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }, [from, to, source, group, validateDates]);

  const setRange = (preset: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth') => {
    const end = new Date();
    const start = new Date();
    if (preset === 'today') start.setTime(end.getTime());
    else if (preset === 'yesterday') { start.setDate(end.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (preset === 'last7') start.setDate(end.getDate() - 6);
    else if (preset === 'last30') start.setDate(end.getDate() - 29);
    else if (preset === 'thisMonth') start.setDate(1);
    else { start.setTime(new Date(end.getFullYear(), end.getMonth() - 1, 1).getTime()); end.setTime(new Date(end.getFullYear(), end.getMonth(), 0).getTime()); }
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
    setDateValidationError(null);
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from) {
      setFrom(range.from.toISOString().slice(0, 10));
      setTo((range.to ?? range.from).toISOString().slice(0, 10));
    }
    setDateValidationError(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = async () => {
    if (!data) return;
    const BOM = '\uFEFF';
    const rows: string[][] = [
      [language === 'ar' ? 'تقرير المبيعات' : 'Sales Report', from, to],
      [],
      [language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue', format(data.sales.totalRevenue)],
      [language === 'ar' ? 'عدد الطلبات' : 'Orders Count', String(data.sales.ordersCount)],
      [language === 'ar' ? 'متوسط قيمة الطلب' : 'Avg Order Value', format(data.sales.avgOrderValue)],
      [],
      [language === 'ar' ? 'العمليات' : 'Transactions'],
      [language === 'ar' ? 'النوع' : 'Type', language === 'ar' ? 'التاريخ' : 'Date', language === 'ar' ? 'المبلغ' : 'Amount'],
      ...transactions.slice(0, 200).map((tr) => [tr.type, tr.date, format(tr.total)]),
      [],
      [language === 'ar' ? 'المنتج' : 'Product', language === 'ar' ? 'الكمية' : 'Qty', language === 'ar' ? 'الإيراد' : 'Revenue'],
      ...data.topProducts.map((p) => [p.name || p.sku, String(p.qty), format(p.revenue)]),
    ];
    const csvText = BOM + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    await exportReportToCSV(csvText, `report_${from}_${to}.csv`);
  };

  const handleExportExcel = async () => {
    if (!data) return;
    const sheets: { name: string; rows: any[][] }[] = [
      {
        name: language === 'ar' ? 'ملخص' : 'Summary',
        rows: [
          [language === 'ar' ? 'تقرير المبيعات' : 'Sales Report', from, to],
          [],
          [language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue', String(data.sales.totalRevenue)],
          [language === 'ar' ? 'عدد الطلبات' : 'Orders Count', String(data.sales.ordersCount)],
          [language === 'ar' ? 'متوسط قيمة الطلب' : 'Avg Order Value', String(data.sales.avgOrderValue)],
          [language === 'ar' ? 'مبيعات نقطة البيع' : 'POS Revenue', String(data.sales.posRevenue)],
          [language === 'ar' ? 'مبيعات الأونلاين المؤكدة' : 'Online Revenue (Confirmed)', String(data.sales.onlineRevenueConfirmed)],
        ],
      },
      {
        name: language === 'ar' ? 'العمليات' : 'Transactions',
        rows: [
          [language === 'ar' ? 'النوع' : 'Type', language === 'ar' ? 'التاريخ' : 'Date', language === 'ar' ? 'المبلغ' : 'Amount', language === 'ar' ? 'الحالة' : 'Status', language === 'ar' ? 'الكود' : 'Code'],
          ...transactions.map((tr) => [tr.type, tr.date, String(tr.total), tr.status || '-', tr.publicCode || '-']),
        ],
      },
      {
        name: language === 'ar' ? 'أفضل المنتجات' : 'TopProducts',
        rows: [
          [language === 'ar' ? 'المنتج' : 'Product', language === 'ar' ? 'SKU' : 'SKU', language === 'ar' ? 'الكمية' : 'Qty', language === 'ar' ? 'الإيراد' : 'Revenue'],
          ...data.topProducts.map((p) => [p.name || p.sku, p.sku, String(p.qty), String(p.revenue)]),
        ],
      },
    ];
    if (data.sales.statusBreakdown) {
      sheets.push({
        name: language === 'ar' ? 'حالة الطلبات' : 'OrdersStatus',
        rows: [
          [language === 'ar' ? 'الحالة' : 'Status', language === 'ar' ? 'العدد' : 'Count'],
          ...Object.entries(data.sales.statusBreakdown).map(([k, v]) => [k, String(v)]),
        ],
      });
    }
    if (data.charts.dailyRevenue?.length) {
      sheets.push({
        name: language === 'ar' ? 'إيرادات يومية' : 'DailyRevenue',
        rows: [
          [language === 'ar' ? 'التاريخ' : 'Date', 'POS', language === 'ar' ? 'أونلاين' : 'Online', language === 'ar' ? 'الإجمالي' : 'Total'],
          ...data.charts.dailyRevenue.map((r) => [r.date, String(r.pos), String(r.onlineConfirmed), String(r.total)]),
        ],
      });
    }
    await exportReportToExcel(sheets, `report_${from}_${to}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!printAreaRef.current) return;
    try {
      await exportReportToPDF(printAreaRef.current, `report_${from}_${to}.pdf`);
    } catch (_e) {
      window.print();
      setError(language === 'ar' ? 'PDF تعذر، استخدم Print ثم Save as PDF' : 'PDF export failed; use Print then Save as PDF');
      setTimeout(() => setError(null), 5000);
    }
  };

  const dateRange: { from: Date; to?: Date } = {
    from: new Date(from),
    to: to ? new Date(to) : undefined,
  };

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <h1 className="text-2xl font-bold text-cyan-200 mb-6">{t('reports.title')}</h1>

        <div className="flex flex-wrap items-center gap-4 mb-6 print:hidden">
          <label className="text-sm text-gray-400">{t('reports.dateRange')}:</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200 hover:bg-cyan-500/10"
            >
              <Calendar className="w-4 h-4" />
              <span>{from} – {to}</span>
            </button>
            {calendarOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCalendarOpen(false)} aria-hidden="true" />
                <div className="absolute top-full left-0 mt-2 z-50 rounded-xl border border-cyan-500/40 bg-gray-900 p-4 shadow-xl">
                  <DayPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={handleCalendarSelect}
                    numberOfMonths={1}
                    className="text-cyan-200 [&_.rdp-day_selected]:bg-cyan-500 [&_.rdp-day_range_middle]:bg-cyan-500/30 [&_.rdp-day:hover]:bg-cyan-500/20"
                  />
                </div>
              </>
            )}
          </div>
          <span className="text-gray-500">–</span>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setDateValidationError(null); }}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200 w-40"
            title={language === 'ar' ? 'تاريخ البداية (يدوي)' : 'Start date (manual)'}
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setDateValidationError(null); }}
            className="rounded-lg border border-cyan-500/40 bg-black/50 px-3 py-2 text-cyan-200 w-40"
            title={language === 'ar' ? 'تاريخ النهاية (يدوي)' : 'End date (manual)'}
          />
          <div className="flex gap-2 flex-wrap">
            {(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as const).map((p) => {
              const label = p === 'last7' ? t('reports.last7days') : p === 'last30' ? t('reports.last30days') : t(`reports.${p}`);
              return (
                <button key={p} onClick={() => setRange(p)} className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-sm">
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => setSource('all')}
              className={`px-3 py-1.5 rounded-lg ${source === 'all' ? 'bg-cyan-500/30 border-cyan-500' : 'border border-cyan-500/40'} text-cyan-300`}
            >
              All
            </button>
            <button
              onClick={() => setSource('pos')}
              className={`px-3 py-1.5 rounded-lg ${source === 'pos' ? 'bg-cyan-500/30 border-cyan-500' : 'border border-cyan-500/40'} text-cyan-300`}
            >
              POS
            </button>
            <button
              onClick={() => setSource('online')}
              className={`px-3 py-1.5 rounded-lg ${source === 'online' ? 'bg-cyan-500/30 border-cyan-500' : 'border border-cyan-500/40'} text-cyan-300`}
            >
              Online
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">{language === 'ar' ? 'تجميعة' : 'Group'}:</span>
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`px-3 py-1.5 rounded-lg text-sm ${group === g ? 'bg-cyan-500/30 border-cyan-500' : 'border border-cyan-500/40'} text-cyan-300`}
              >
                {g === 'day' ? (language === 'ar' ? 'يومي' : 'Daily') : g === 'week' ? (language === 'ar' ? 'أسبوعي' : 'Weekly') : (language === 'ar' ? 'شهري' : 'Monthly')}
              </button>
            ))}
          </div>
          <button onClick={loadData} disabled={loading} className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50">
            {t('reports.generateReport')}
          </button>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
              Print
            </button>
            <button onClick={handleExportCSV} disabled={!data} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50">
              Export CSV
            </button>
            <button onClick={handleExportExcel} disabled={!data} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50">
              Export Excel
            </button>
            <button onClick={handleExportPDF} disabled={!data} className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50">
              Export PDF
            </button>
          </div>
        </div>

        {(dateValidationError || error) && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
            {dateValidationError || error}
          </div>
        )}

        <div ref={printAreaRef} className="print-area space-y-6 print:space-y-4">
          <div className="hidden print:block border-b border-cyan-500/30 pb-4 mb-4">
            <h2 className="text-xl font-bold text-cyan-200">Crown Services — {t('reports.title')}</h2>
            <p className="text-sm text-gray-400">{from} — {to} | {user?.username || ''} | {new Date().toLocaleString()}</p>
          </div>

          {!data && !loading && (
            <div className="p-8 neon-card rounded-xl text-center text-gray-400 print:hidden">
              <p>{language === 'ar' ? 'اختر الفترة واضغط إنشاء تقرير لعرض البيانات' : 'Select date range and click Generate Report to load data'}</p>
            </div>
          )}

          {data?.ok && (
            <>
              <div className="p-6 neon-card rounded-xl break-inside-avoid">
                <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('reports.salesSummary')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div><p className="text-xs text-gray-500">{t('dashboard.totalSales')}</p><p className="text-lg font-bold text-cyan-400">{format(data.sales.totalRevenue)}</p></div>
                  <div><p className="text-xs text-gray-500">{language === 'ar' ? 'عدد الطلبات' : 'Orders'}</p><p className="text-lg font-bold">{data.sales.ordersCount}</p></div>
                  <div><p className="text-xs text-gray-500">{language === 'ar' ? 'متوسط الطلب' : 'Avg Order'}</p><p className="text-lg font-bold">{format(data.sales.avgOrderValue)}</p></div>
                  <div><p className="text-xs text-gray-500">{t('reports.totalOnline')}</p><p className="text-lg font-bold text-fuchsia-400">{format(data.sales.onlineRevenueConfirmed)}</p></div>
                </div>
                {data.charts.dailyRevenue.length > 0 && (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data.charts.dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(d) => formatDateStr(d, language)} />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip contentStyle={{ backgroundColor: '#0b1220', border: '1px solid #00f3ff', borderRadius: '8px' }} labelFormatter={(d) => formatDateStr(d, language)} />
                      <Legend />
                      <Line type="monotone" dataKey="pos" stroke="#00f3ff" name="POS" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="onlineConfirmed" stroke="#ec4899" name="Online" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="total" stroke="#fbbf24" name="Total" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="p-6 neon-card rounded-xl break-inside-avoid">
                <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('reports.profitSummary')}</h3>
                {data.profit.available ? (
                  <>
                    <p className="text-lg font-bold text-fuchsia-400 mb-4">{format(data.profit.totalProfit ?? 0)}</p>
                    {data.charts.dailyProfit && data.charts.dailyProfit.length > 0 && (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={data.charts.dailyProfit}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                          <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(d) => formatDateStr(d, language)} />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip contentStyle={{ backgroundColor: '#0b1220', border: '1px solid #ec4899', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="profit" stroke="#ec4899" name={t('dashboard.profit')} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500">{language === 'ar' ? data.profit.profitNoteAr : data.profit.profitNoteEn}</p>
                )}
              </div>

              {data.sales.statusBreakdown && (
                <div className="p-6 neon-card rounded-xl break-inside-avoid">
                  <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('reports.ordersStatusBreakdown')}</h3>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(data.sales.statusBreakdown).map(([k, v]) => (
                      <span key={`status-${k}`} className="px-3 py-2 rounded-lg bg-gray-800/50 border border-cyan-500/20">
                        {k}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.topProducts.length > 0 && (
                <div className="p-6 neon-card rounded-xl break-inside-avoid">
                  <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('reports.topProducts')}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-cyan-500">
                          <th className="pb-2 pr-4">{language === 'ar' ? 'المنتج' : 'Product'}</th>
                          <th className="pb-2 pr-4">{language === 'ar' ? 'الكمية' : 'Qty'}</th>
                          <th className="pb-2">{language === 'ar' ? 'الإيراد' : 'Revenue'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.slice(0, 15).map((p, idx) => (
                          <tr key={`top-${idx}-${p.productId}-${p.sku || ''}`} className="border-b border-gray-800">
                            <td className="py-2 pr-4">{p.name || p.sku}</td>
                            <td className="py-2 pr-4">{p.qty}</td>
                            <td className="py-2">{format(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {deadStockData?.ok && deadStockData.summary && (deadStockData.summary.deadCount > 0 || deadStockData.summary.slowCount > 0) && (
            <div className="p-6 neon-card rounded-xl break-inside-avoid">
              <h3 className="text-xl font-bold mb-4 text-cyan-200">{t('nav.slowMoving')}</h3>
              <p className="text-sm text-gray-400 mb-4">
                {language === 'ar' ? 'الراكد' : 'Dead'}: {deadStockData.summary.deadCount} | {language === 'ar' ? 'البطيء' : 'Slow'}: {deadStockData.summary.slowCount} | {language === 'ar' ? 'القيمة المربوطة' : 'Tied Value'}: {format((deadStockData.summary.deadValue ?? 0) + (deadStockData.summary.slowValue ?? 0))}
              </p>
              <Link href="/store-admin/inventory/slow-moving" className="text-cyan-400 hover:underline text-sm print:hidden">
                {language === 'ar' ? 'عرض التفاصيل' : 'View details'}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
