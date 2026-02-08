'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '../components/Sidebar';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';

interface Invoice {
  id: number;
  invoice_number: string | number;
  invoice_serial?: string | null;
  total_amount?: number;
  total?: number;
  payment_method?: string;
  created_at?: string;
  order_created_at?: string;
  print_count?: number;
  printed_count?: number;
  last_printed_at?: string | null;
  source?: string | null;
  online_order_id?: number | null;
  order_id?: number;
  invoiceSource?: 'pos' | 'online';
  customer_name?: string;
  customer_phone?: string;
  phone?: string;
  customer_address?: string;
  address?: string;
  public_code?: string;
  cashier_name?: string;
  business_name?: string;
  owner_name?: string;
  activity_type?: string;
  contact_email?: string;
  contact_phone?: string;
  logo_url?: string;
}

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const sourceParam = searchParams.get('source');
  const { t, direction, language } = useLanguage();
  const { user } = useAuth();
  const { symbol } = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [business, setBusiness] = useState<Partial<Invoice> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<number, any[]>>({});
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'online'>(
    sourceParam === 'online' ? 'online' : sourceParam === 'pos' ? 'pos' : 'all'
  );
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const focusHandledRef = useRef(false);

  useEffect(() => {
    if (sourceParam === 'online') setSourceFilter('online');
    else if (sourceParam === 'pos') setSourceFilter('pos');
  }, [sourceParam]);

  useEffect(() => {
    if (!user) return;
    const handler = () => {
      loadInvoices();
    };
    const delay = search.trim() ? 350 : 0;
    const timer = setTimeout(handler, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sourceFilter, search]);

  useEffect(() => {
    if (focusId && invoices.length > 0 && !focusHandledRef.current) {
      const id = parseInt(focusId, 10);
      if (Number.isFinite(id) && invoices.some((inv) => inv.id === id)) {
        setExpanded(id);
        focusHandledRef.current = true;
      }
    }
  }, [focusId, invoices]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const [shopData, ...rest] = await Promise.all([apiRequest('/shops/profile')]);
      setBusiness(shopData);
      if (sourceFilter === 'online') {
        const params = new URLSearchParams({ limit: '200' });
        if (search.trim()) params.set('query', search.trim());
        const data = await apiRequest(`/admin/online-invoices?${params.toString()}`);
        setInvoices(
          (data || []).map((r: any) => ({
            ...r,
            invoiceSource: 'online' as const,
            total_amount: r.total,
            created_at: r.order_created_at || r.created_at,
            print_count: r.printed_count,
            customer_phone: r.phone,
          }))
        );
      } else if (sourceFilter === 'pos') {
        const params = new URLSearchParams({ limit: '200', source: 'pos' });
        if (search.trim()) params.set('search', search.trim());
        const data = await apiRequest(`/sales?${params.toString()}`);
        setInvoices((data || []).map((r: any) => ({ ...r, invoiceSource: 'pos' as const })));
      } else {
        const [posData, onlineData] = await Promise.all([
          apiRequest('/sales?limit=200&source=pos'),
          apiRequest('/admin/online-invoices?limit=200'),
        ]);
        const pos = (posData || []).map((r: any) => ({ ...r, invoiceSource: 'pos' as const }));
        const online = (onlineData || []).map((r: any) => ({
          ...r,
          invoiceSource: 'online' as const,
          total_amount: r.total,
          created_at: r.order_created_at || r.created_at,
          print_count: r.printed_count,
          customer_phone: r.phone,
        }));
        setInvoices([...online, ...pos].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const toggleInvoice = async (invoiceId: number, invoice?: Invoice) => {
    if (expanded === invoiceId) {
      setExpanded(null);
      return;
    }
    setExpanded(invoiceId);
    if (!itemsMap[invoiceId]) {
      try {
        const isOnline = invoice?.invoiceSource === 'online';
        const items = isOnline
          ? (await apiRequest(`/admin/online-invoices/${invoiceId}`))?.items || []
          : await apiRequest(`/sales/${invoiceId}/items`);
        setItemsMap((prev) => ({ ...prev, [invoiceId]: items }));
      } catch (err) {
        // ignore
      }
    }
  };

  const printInvoice = async (invoice: Invoice) => {
    try {
      setPrintingId(invoice.id);
      setError(null);

      const isOnline = invoice.invoiceSource === 'online';
      let items = itemsMap[invoice.id];
      if (!items) {
        items = isOnline
          ? (await apiRequest(`/admin/online-invoices/${invoice.id}`))?.items || []
          : await apiRequest(`/sales/${invoice.id}/items`);
        setItemsMap((prev) => ({ ...prev, [invoice.id]: items }));
      }

      const prevCount = Number(invoice.print_count || invoice.printed_count || 0);
      let printCount = 0;
      let lastPrintedAt: string | null = null;
      try {
        if (isOnline) {
          const printInfo = await apiRequest(`/admin/online-invoices/${invoice.id}/print`, { method: 'POST' });
          printCount = Number(printInfo?.printCount || 0);
          lastPrintedAt = printInfo?.lastPrintedAt || null;
        } else {
          const printInfo = await apiRequest(`/sales/${invoice.id}/print`, { method: 'POST' });
          printCount = Number(printInfo?.printCount || 0);
          lastPrintedAt = printInfo?.lastPrintedAt || null;
        }
        setInvoices((prev) =>
          prev.map((row) =>
            row.id === invoice.id
              ? { ...row, print_count: printCount, printed_count: printCount, last_printed_at: lastPrintedAt }
              : row
          )
        );
      } catch {
        // If print counter fails, still allow printing
      }

      if (prevCount > 0) {
        const lastPrinted = invoice.last_printed_at
          ? new Date(invoice.last_printed_at).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')
          : '';
        showToast(
          language === 'ar'
            ? `تنبيه: تمت طباعة الفاتورة من قبل (آخر طباعة: ${lastPrinted})`
            : `Warning: invoice was printed before (last printed: ${lastPrinted})`
        );
      }

      const receiptWindow = window.open('', '_blank');
      if (!receiptWindow) return;

      const duplicateLabel =
        printCount && printCount > 1 ? `Duplicate Copy No. ${Math.max(1, printCount - 1)}` : '';

      const itemsHtml = (items || [])
        .map(
          (item: any) => {
            const name = item.name_snapshot || (language === 'ar' ? item.name_ar : item.name_en);
            const totalPrice = item.total_price ?? (Number(item.price_snapshot || 0) * Number(item.quantity || 0));
            return `
            <div class="item">
              <span class="item-name">${name}</span>
              <span class="item-qty">${Number(item.quantity || 0)}x</span>
              <span class="item-price">${Number(totalPrice).toFixed(2)} ${symbol}</span>
            </div>
          `;
          }
        )
        .join('');

      const receiptHTML = `
        <!DOCTYPE html>
        <html dir="${language === 'ar' ? 'rtl' : 'ltr'}" lang="${language}">
          <head>
            <meta charset="UTF-8">
            <title>Receipt - ${invoice.invoice_number || invoice.id}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: 'Orbitron', monospace;
                background: #ffffff;
                color: #111827;
                padding: 24px;
                line-height: 1.6;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .receipt {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 24px;
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                min-height: 70vh;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 20px;
              }
              .header h1 {
                font-size: 34px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 3px;
                margin-bottom: 10px;
              }
              .header p {
                font-size: 12px;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 2px;
              }
              .copy-label {
                display: inline-block;
                margin-top: 10px;
                padding: 6px 12px;
                border-radius: 999px;
                border: 2px solid #ef4444;
                color: #991b1b;
                background: #fee2e2;
                font-weight: 900;
                font-size: 12px;
                letter-spacing: 1px;
                text-transform: uppercase;
              }
              .info {
                margin-bottom: 25px;
                font-size: 11px;
                color: #4b5563;
              }
              .items { margin-bottom: 25px; }
              .item {
                display: flex;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #e5e7eb;
                font-size: 13px;
              }
              .item-name { flex: 1; color: #111827; }
              .item-qty { margin: 0 15px; color: #6b7280; }
              .item-price { color: #111827; font-weight: 700; }
              .total {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                justify-content: space-between;
                font-size: 20px;
                font-weight: 700;
                text-transform: uppercase;
              }
              .footer {
                margin-top: 30px;
                text-align: center;
                font-size: 10px;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
              @media print {
                @page { size: auto portrait; margin: 8mm; }
                body { padding: 0; }
                .receipt {
                  box-shadow: none;
                  border-color: #d1d5db;
                  width: 100%;
                  max-width: 210mm;
                  min-height: 100%;
                  page-break-inside: avoid;
                }
                .footer { margin-top: auto; }
              }
              @media print and (max-width: 90mm) {
                .receipt { max-width: 80mm; }
              }
            </style>
          </head>
          <body>
            <div class="receipt">
              <div class="content">
                <div class="header">
                  ${business?.logo_url ? `<img src="${business.logo_url}" alt="Logo" style="height: 48px; margin-bottom: 8px;" />` : ''}
                  <h1>${business?.business_name || 'Crown Services'}</h1>
                  <p>${business?.activity_type || (language === 'ar' ? 'تاج الخدمات' : 'Services ERP')}</p>
                  ${duplicateLabel ? `<div class="copy-label">${duplicateLabel}</div>` : ''}
                </div>
                <div class="info">
                  <p>Invoice # / رقم الفاتورة: ${invoice.invoiceSource === 'online' ? `ON-${invoice.invoice_number}` : (invoice.invoice_serial || invoice.invoice_number || invoice.id)}</p>
                  <p>Date / التاريخ: ${new Date(invoice.created_at ?? Date.now()).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</p>
                  <p>Cashier / الكاشير: ${invoice.cashier_name || 'N/A'}</p>
                  <p>Customer / العميل: ${invoice.customer_name || (language === 'ar' ? 'عميل مباشر' : 'Walk-in')}</p>
                  ${(invoice.customer_phone || invoice.phone) ? `<p>Phone / الهاتف: ${invoice.customer_phone || invoice.phone}</p>` : ''}
                  ${(invoice.customer_address || invoice.address) ? `<p>Address / العنوان: ${invoice.customer_address || invoice.address}</p>` : ''}
                  ${business?.address ? `<p>Shop Address: ${business.address}</p>` : ''}
                  ${business?.contact_phone ? `<p>Shop Phone: ${business.contact_phone}</p>` : ''}
                </div>
                <div class="items">
                  <div class="item" style="font-weight: 700;">
                    <span class="item-name">Item / الصنف</span>
                    <span class="item-qty">Qty / الكمية</span>
                    <span class="item-price">Price / السعر</span>
                  </div>
                  ${itemsHtml || ''}
                </div>
                <div class="total">
                  <span>Total / الإجمالي</span>
                  <span>${Number(invoice.total_amount ?? invoice.total ?? 0).toFixed(2)} ${symbol}</span>
                </div>
              </div>
              <div class="footer">
                <p>Thank you for your visit! / شكراً لزيارتكم!</p>
                <p>Powered by Crown Services | www.crowncs.org</p>
              </div>
            </div>
          </body>
        </html>
      `;

      receiptWindow.document.write(receiptHTML);
      receiptWindow.document.close();
      setTimeout(() => {
        receiptWindow.print();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to print invoice');
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
          <h1 className="text-2xl font-bold text-cyan-200 mb-6">{t('invoices.title')}</h1>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSourceFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              sourceFilter === 'all'
                ? 'bg-cyan-600 text-white'
                : 'border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10'
            }`}
          >
            {language === 'ar' ? 'الكل' : 'All'}
          </button>
          <button
            onClick={() => setSourceFilter('pos')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              sourceFilter === 'pos'
                ? 'bg-cyan-600 text-white'
                : 'border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10'
            }`}
          >
            POS
          </button>
          <button
            onClick={() => setSourceFilter('online')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
              sourceFilter === 'online'
                ? 'bg-cyan-600 text-white'
                : 'border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10'
            }`}
          >
            {language === 'ar' ? 'أونلاين' : 'Online'}
          </button>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={language === 'ar' ? 'ابحث برقم الفاتورة / الهاتف / اسم العميل...' : 'Search by invoice #, phone, customer name...'}
            className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-cyan-500/30 bg-black/30 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        {toast && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            {toast}
          </div>
        )}
        <div className="neon-card rounded-xl p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {business && (
            <div className="mb-6 rounded-lg border border-cyan-500/20 p-4 text-sm text-slate-300 flex items-center gap-4">
              {business.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={business.logo_url} alt="Logo" className="h-12 w-12 rounded-md object-cover border border-cyan-500/20" />
              ) : (
                <div className="h-12 w-12 rounded-md border border-cyan-500/20 flex items-center justify-center text-cyan-300/60">
                  {business.business_name?.[0] || 'C'}
                </div>
              )}
              <div>
                <div className="font-semibold text-cyan-200">{business.business_name || business.owner_name}</div>
                <div>{business.activity_type || ''}</div>
                <div>{business.address || ''}</div>
                <div>{business.contact_phone || ''}</div>
                <div>{business.contact_email || ''}</div>
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-sm text-slate-300">{t('common.loading')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-cyan-400 border-b border-cyan-500/20">
                  <tr>
                    <th className="py-2 text-left">#</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'الإجمالي' : 'Total'}</th>
                    <th className="py-2 text-left">{language === 'ar' ? 'تفاصيل' : 'Details'}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        {language === 'ar' ? 'لا توجد فواتير' : 'No invoices found'}
                      </td>
                    </tr>
                  ) : (
                    invoices.map((invoice) => (
                      <React.Fragment key={invoice.id}>
                        <tr className="border-b border-cyan-500/10">
                          <td className="py-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{invoice.invoiceSource === 'online' ? `ON-${invoice.invoice_number}` : (invoice.invoice_serial || invoice.invoice_number || invoice.id)}</span>
                              {(invoice.source === 'online' || invoice.online_order_id) && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200">
                                  {language === 'ar' ? 'أونلاين' : 'Online'}
                                </span>
                              )}
                              {(!invoice.source || invoice.source === 'pos') && !invoice.online_order_id && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-200">
                                  POS
                                </span>
                              )}
                              {((invoice.print_count ?? invoice.printed_count ?? 0) >= 1) && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-500/40 text-slate-200">
                                  {language === 'ar' ? `تمت الطباعة (${invoice.print_count ?? invoice.printed_count})` : `Printed #${invoice.print_count ?? invoice.printed_count}`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2">
                            <div>{invoice.customer_name || (language === 'ar' ? 'عميل مباشر' : 'Walk-in')}</div>
                            <div className="text-xs text-slate-400">{invoice.customer_phone || ''}</div>
                          </td>
                          <td className="py-2">
                            {new Date(invoice.created_at ?? Date.now()).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
                          </td>
                          <td className="py-2">
                            {Number(invoice.total_amount ?? invoice.total ?? 0).toFixed(2)} {symbol}
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => toggleInvoice(invoice.id, invoice)}
                              className="text-cyan-300 hover:text-cyan-200 text-xs"
                            >
                              {expanded === invoice.id
                                ? language === 'ar'
                                  ? 'إخفاء التفاصيل'
                                  : 'Hide details'
                                : language === 'ar'
                                  ? 'عرض التفاصيل'
                                  : 'View details'}
                            </button>
                          </td>
                        </tr>
                        {expanded === invoice.id && (
                          <tr className="border-b border-cyan-500/10 bg-[#0f172a]">
                            <td colSpan={5} className="py-3">
                              <div className="text-xs text-slate-400 mb-2 space-y-1">
                                <div>{invoice.customer_address || ''}</div>
                                <div>{language === 'ar' ? 'الكاشير' : 'Cashier'}: {invoice.cashier_name || '—'}</div>
                                <div>{language === 'ar' ? 'طريقة الدفع' : 'Payment'}: {invoice.payment_method}</div>
                                <div className="pt-2">
                                  <button
                                    onClick={() => printInvoice(invoice)}
                                    disabled={printingId === invoice.id}
                                    className="text-cyan-300 hover:text-cyan-200 text-xs border border-cyan-500/30 rounded-md px-3 py-1"
                                  >
                                    {printingId === invoice.id
                                      ? language === 'ar'
                                        ? 'جاري الطباعة...'
                                        : 'Printing...'
                                      : language === 'ar'
                                        ? 'طباعة'
                                        : 'Print'}
                                  </button>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="text-cyan-300">
                                    <tr>
                                      <th className="text-left py-1">{language === 'ar' ? 'المنتج' : 'Product'}</th>
                                      <th className="text-left py-1">{language === 'ar' ? 'الكمية' : 'Qty'}</th>
                                      <th className="text-left py-1">{language === 'ar' ? 'السعر' : 'Price'}</th>
                                      <th className="text-left py-1">{language === 'ar' ? 'الإجمالي' : 'Total'}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(itemsMap[invoice.id] || []).map((item: any, idx: number) => {
                                      const name = item.name_snapshot || (language === 'ar' ? item.name_ar : item.name_en);
                                      const unitPrice = item.unit_price ?? item.price_snapshot ?? 0;
                                      const totalPrice = item.total_price ?? (Number(item.price_snapshot || 0) * Number(item.quantity || 0));
                                      return (
                                      <tr key={item.id || idx}>
                                        <td className="py-1">{name}</td>
                                        <td className="py-1">{item.quantity}</td>
                                        <td className="py-1">{Number(unitPrice).toFixed(2)} {symbol}</td>
                                        <td className="py-1">{Number(totalPrice).toFixed(2)} {symbol}</td>
                                      </tr>
                                    );})}
                                    {(itemsMap[invoice.id] || []).length === 0 && (
                                      <tr>
                                        <td colSpan={4} className="py-2 text-slate-500">
                                          {language === 'ar' ? 'لا توجد عناصر' : 'No items found'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <InvoicesPageContent />
    </Suspense>
  );
}

