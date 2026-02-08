'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '../../components/Sidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiRequest, useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Package, ChevronDown, ChevronUp } from 'lucide-react';

interface Order {
  id: number;
  shop_id: number;
  status: string;
  customer_name: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  notes?: string | null;
  total: number;
  created_at: string;
}

interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name_snapshot?: string | null;
  sku_snapshot?: string | null;
  sell_price_snapshot?: number;
  price_snapshot?: number;
  quantity: number;
}

function OnlineOrdersPageContent() {
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get('focus');
  const { t, language, direction } = useLanguage();
  const { user } = useAuth();
  const { symbol } = useCurrency();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<number, OrderItem[]>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const orderRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!user) return;
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter]);

  useEffect(() => {
    if (focusOrderId && orders.length > 0) {
      const id = parseInt(focusOrderId, 10);
      if (Number.isFinite(id) && orders.some((o) => o.id === id)) {
        setExpandedId(id);
        void loadOrderDetails(id);
        setTimeout(() => {
          const el = orderRefs.current[id];
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [focusOrderId, orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter ? `/admin/orders?status=${statusFilter}` : '/admin/orders';
      const data = await apiRequest(url);
      setOrders(data);
    } catch (err: any) {
      setError(err.message || (language === 'ar' ? 'فشل تحميل الطلبات' : 'Failed to load orders'));
    } finally {
      setLoading(false);
    }
  };

  const loadOrderDetails = async (orderId: number) => {
    if (itemsMap[orderId]) {
      setExpandedId(expandedId === orderId ? null : orderId);
      return;
    }
    try {
      const order = await apiRequest(`/admin/orders/${orderId}`);
      setItemsMap((prev) => ({ ...prev, [orderId]: order.items || [] }));
      setExpandedId(orderId);
    } catch (err) {
      setItemsMap((prev) => ({ ...prev, [orderId]: [] }));
      setExpandedId(orderId);
    }
  };

  const updateStatus = async (orderId: number, status: string) => {
    try {
      setUpdatingId(orderId);
      await apiRequest(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (err: any) {
      setError(err.message || (language === 'ar' ? 'فشل تحديث الحالة' : 'Failed to update status'));
    } finally {
      setUpdatingId(null);
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      pending: { ar: 'قيد الانتظار', en: 'Pending' },
      confirmed: { ar: 'مؤكد', en: 'Confirmed' },
      cancelled: { ar: 'ملغي', en: 'Cancelled' },
      completed: { ar: 'مكتمل', en: 'Completed' },
    };
    return map[s]?.[language] || s;
  };

  return (
    <div className={`min-h-screen flex ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
      <Sidebar />
      <main className="flex-1 p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-cyan-200 mb-6">
            {t('nav.onlineOrders')}
          </h1>

          {/* Status filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setStatusFilter('')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                !statusFilter
                  ? 'bg-cyan-600 text-white'
                  : 'border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10'
              }`}
            >
              {language === 'ar' ? 'الكل' : 'All'}
            </button>
            {['pending', 'confirmed', 'completed', 'cancelled'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                  statusFilter === s
                    ? 'bg-cyan-600 text-white'
                    : 'border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10'
                }`}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-slate-400 text-sm py-8">
              {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-cyan-500/20 bg-white/5 p-8 text-slate-400 text-center">
              {language === 'ar' ? 'لا توجد طلبات أونلاين' : 'No online orders'}
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  ref={(el) => { orderRefs.current[order.id] = el; }}
                  className="rounded-2xl border border-cyan-500/20 bg-white/5 overflow-hidden"
                >
                  <div
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 cursor-pointer"
                    onClick={() => loadOrderDetails(order.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-cyan-100 font-bold">
                        #{order.id}
                      </div>
                      <div>
                        <div className="text-slate-100 font-semibold">{order.customer_name}</div>
                        <div className="text-xs text-slate-400">{order.phone}</div>
                      </div>
                      <div className="text-cyan-200 font-bold">
                        {Number(order.total).toFixed(2)} {symbol}
                      </div>
                      <div
                        className={`text-xs px-2 py-1 rounded-full border ${
                          order.status === 'completed'
                            ? 'border-green-500/30 bg-green-500/10 text-green-200'
                            : order.status === 'cancelled'
                            ? 'border-red-500/30 bg-red-500/10 text-red-200'
                            : order.status === 'confirmed'
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                        }`}
                      >
                        {statusLabel(order.status)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleString(
                          language === 'ar' ? 'ar-EG' : 'en-US'
                        )}
                      </div>
                    </div>
                    {expandedId === order.id ? (
                      <ChevronUp className="h-5 w-5 text-cyan-300" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-cyan-300" />
                    )}
                  </div>

                  {expandedId === order.id && (
                    <div className="border-t border-cyan-500/15 px-5 py-4 bg-black/20">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            {language === 'ar' ? 'العنوان' : 'Address'}
                          </div>
                          <div className="text-sm text-slate-200">
                            {order.governorate}, {order.city}
                          </div>
                          <div className="text-sm text-slate-200">{order.address}</div>
                        </div>
                        {order.notes && (
                          <div>
                            <div className="text-xs text-slate-400 mb-1">
                              {language === 'ar' ? 'ملاحظات' : 'Notes'}
                            </div>
                            <div className="text-sm text-slate-200">{order.notes}</div>
                          </div>
                        )}
                      </div>
                      <div className="mb-4">
                        <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" />
                          {language === 'ar' ? 'المنتجات' : 'Items'}
                        </div>
                        <div className="space-y-2">
                          {(itemsMap[order.id] || []).map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-sm text-slate-200 py-1"
                            >
                              <span>{item.name_snapshot || '-'} x {item.quantity}</span>
                              <span>
                                {(Number(item.sell_price_snapshot ?? item.price_snapshot ?? 0) * item.quantity).toFixed(2)} {symbol}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {order.status === 'pending' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, 'confirmed');
                              }}
                              disabled={updatingId === order.id}
                              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-60"
                            >
                              {language === 'ar' ? 'تأكيد' : 'Confirm'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, 'cancelled');
                              }}
                              disabled={updatingId === order.id}
                              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-200 hover:bg-red-500/10 text-sm font-semibold disabled:opacity-60"
                            >
                              {language === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, 'completed');
                              }}
                              disabled={updatingId === order.id}
                              className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-60"
                            >
                              {language === 'ar' ? 'مكتمل' : 'Complete'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus(order.id, 'cancelled');
                              }}
                              disabled={updatingId === order.id}
                              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-200 hover:bg-red-500/10 text-sm font-semibold disabled:opacity-60"
                            >
                              {language === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function OnlineOrdersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <OnlineOrdersPageContent />
    </Suspense>
  );
}
