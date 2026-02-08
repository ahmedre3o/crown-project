'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, MapPin, Phone, Clock, CheckCircle, XCircle } from 'lucide-react';
import { apiUrl } from '../api-config';
import Link from 'next/link';

interface TrackData {
  orderId: number;
  publicCode: string;
  status: string;
  customerName: string;
  phone: string;
  address: string;
  total: number;
  currency: string;
  createdAt: string;
  items: Array<{
    name: string;
    sku?: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
}

interface ShopContext {
  id: number;
  slug?: string;
  domain?: string | null;
  name?: string;
}

function TrackPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  const phone = searchParams.get('phone') || '';
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [data, setData] = useState<TrackData | null>(null);
  const [shop, setShop] = useState<ShopContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim() || !phone.trim()) {
      setLoading(false);
      setError(lang === 'ar' ? 'كود التتبع ورقم الهاتف مطلوبان' : 'Tracking code and phone are required');
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        setError(null);
        const res = await fetch(apiUrl(`/storefront/orders/track?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`));
        const json = await res.json();
        if (!alive) return;
        if (!res.ok || !json?.ok) {
          setError(json?.ar || json?.error || 'Order not found');
          setData(null);
          setShop(null);
          return;
        }
        setData(json.order || json);
        setShop(json.shop || null);
      } catch (e: any) {
        if (alive) {
          setError(e?.message || 'Failed to load');
          setData(null);
          setShop(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, [code, phone]);

  const backToStoreHref = (() => {
    if (shop?.domain) return `/storefront?domain=${encodeURIComponent(shop.domain)}`;
    if (shop?.id) return `/storefront?preview=${encodeURIComponent(shop.slug || `${shop.id}-shop`)}`;
    return '/storefront?shopId=1';
  })();

  const statusLabel = (s: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      confirmed: { ar: 'مؤكد', en: 'Confirmed' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' },
      completed: { ar: 'مكتمل', en: 'Completed' },
    };
    return map[s]?.[lang] || s;
  };

  const steps = [
    { key: 'pending', labelAr: 'قيد الانتظار', labelEn: 'Pending', icon: Clock },
    { key: 'confirmed', labelAr: 'مؤكد', labelEn: 'Confirmed', icon: CheckCircle },
    { key: 'completed', labelAr: 'مكتمل', labelEn: 'Completed', icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-[#06070b] text-white" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.28),transparent_45%),radial-gradient(circle_at_85%_25%,rgba(34,211,238,0.22),transparent_45%)]" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-cyan-200">
            {lang === 'ar' ? 'تتبع الطلب' : 'Track Order'}
          </h1>
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="px-3 py-1 rounded-lg border border-cyan-500/30 text-cyan-200 text-sm"
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-cyan-500/25 bg-black/35 p-8 text-center text-slate-300">
            {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-red-200">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-cyan-500/25 bg-black/35 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-cyan-200 font-bold">
                  #{data.orderId} — {data.publicCode}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    data.status === 'completed'
                      ? 'bg-green-500/20 text-green-200'
                      : data.status === 'cancelled'
                      ? 'bg-red-500/20 text-red-200'
                      : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {statusLabel(data.status)}
                </span>
              </div>

              {/* Timeline */}
              <div className="flex items-center gap-4 mb-6">
                {steps.map((s, i) => {
                  const Icon = s.icon;
                  const active =
                    data.status === s.key ||
                    (s.key === 'pending' && ['pending', 'confirmed', 'completed'].includes(data.status)) ||
                    (s.key === 'confirmed' && ['confirmed', 'completed'].includes(data.status)) ||
                    (s.key === 'completed' && data.status === 'completed');
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          active ? 'bg-cyan-500/30 text-cyan-200' : 'bg-slate-700/50 text-slate-500'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`w-8 h-0.5 ${active ? 'bg-cyan-500/50' : 'bg-slate-600/50'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <Package className="h-4 w-4 text-cyan-300" />
                  {data.customerName}
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Phone className="h-4 w-4 text-cyan-300" />
                  {data.phone}
                </div>
                <div className="sm:col-span-2 flex items-center gap-2 text-slate-300">
                  <MapPin className="h-4 w-4 text-cyan-300 shrink-0" />
                  {data.address}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-cyan-500/20">
                <div className="text-slate-400 text-xs mb-2">
                  {lang === 'ar' ? 'تاريخ الطلب' : 'Order date'}:{' '}
                  {new Date(data.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                </div>
                <div className="font-bold text-cyan-200">
                  {lang === 'ar' ? 'الإجمالي' : 'Total'}: {data.total.toFixed(2)} {data.currency}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-500/25 bg-black/35 p-6">
              <h2 className="text-lg font-bold text-cyan-200 mb-4">
                {lang === 'ar' ? 'المنتجات' : 'Items'}
              </h2>
              <div className="space-y-3">
                {data.items.map((item, i) => (
                  <div key={`item-${data.orderId}-${i}-${item.name}-${item.quantity}`} className="flex justify-between text-sm">
                    <span className="text-slate-200">
                      {item.name} x {item.quantity}
                    </span>
                    <span className="text-cyan-200">
                      {item.subtotal.toFixed(2)} {data.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-center">
          <Link
            href={backToStoreHref}
            className="text-cyan-300 hover:text-cyan-200 text-sm underline"
          >
            {lang === 'ar' ? 'العودة للمتجر' : 'Back to Store'}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <TrackPageContent />
    </Suspense>
  );
}
