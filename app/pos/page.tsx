'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Printer, ShoppingCart, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { apiRequest, useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Sidebar } from '../components/Sidebar';
import { BarcodeScanner } from '../components/BarcodeScanner';

interface Category {
  id: number;
  name_en: string;
  name_ar: string;
}

interface Product {
  id: number;
  name_en: string;
  name_ar: string;
  brand: string;
  sell_price: number;
  stock_quantity: number;
  available_stock?: number;
  category_id: number;
  image_url?: string;
  sku?: string;
  barcode?: string;
  qr_code?: string;
}

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export default function PosPage() {
  const { t, language, direction } = useLanguage();
  const { user } = useAuth();
  const { symbol } = useCurrency();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'uncategorized' | 'all' | null>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [business, setBusiness] = useState<any>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const handleScanMatchRef = useRef<(value: string) => void>(() => {});
  const scanSessionRef = useRef<{
    buffer: string;
    lastTs: number;
    scanning: boolean;
    target: HTMLElement | null;
    targetValue: string | null;
  }>({ buffer: '', lastTs: 0, scanning: false, target: null, targetValue: null });

  useEffect(() => {
    if (!user) return;
    loadCategories();
    loadProducts();
    loadBusinessProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    scanInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!scanOpen) {
      scanInputRef.current?.focus();
    }
  }, [scanOpen]);

  const loadCategories = async () => {
    try {
      const data = await apiRequest('/categories');
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await apiRequest('/products');
      setProducts(data);
      console.log('POS Products Loaded:', Array.isArray(data) ? data.length : 0);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadBusinessProfile = async () => {
    try {
      const data = await apiRequest('/shops/profile');
      setBusiness(data);
    } catch (error) {
      // ignore
    }
  };

  const filteredProducts = products.filter((product) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'uncategorized') return !product.category_id;
    if (selectedCategory) return product.category_id === selectedCategory;
    return true;
  });

  const availableCategories = categories.filter((category) =>
    products.some((product) => product.category_id === category.id)
  );

  const hasUncategorized = products.some((product) => !product.category_id);

  const addToCart = (product: Product) => {
    const avail = Number(product.available_stock ?? product.stock_quantity ?? 0);
    if (avail <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        const cap = Number(product.available_stock ?? product.stock_quantity ?? 0);
        if (existing.quantity >= cap) return prev;
        const nextQty = Math.min(existing.quantity + 1, cap);
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQty, total: nextQty * Number(item.price || 0) }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: language === 'ar' ? product.name_ar : product.name_en,
          price: Number(product.sell_price || 0),
          quantity: 1,
          total: Number(product.sell_price || 0),
        },
      ];
    });
  };

  const handleScanMatch = (value: string) => {
    void (async () => {
      const code = String(value || '').trim();
      if (!code) return;
      setScanValue(code);

      // Fast path: local cache
      let match = products.find(
        (product) => product.barcode === code || product.sku === code || product.qr_code === code
      );

      // DB lookup fallback (ensures scanner always works even with large inventories)
      if (!match) {
        try {
          const lookedUp = await apiRequest(`/products/lookup?code=${encodeURIComponent(code)}`);
          if (lookedUp?.id) {
            match = lookedUp as Product;
            setProducts((prev) => {
              const exists = prev.some((p) => p.id === match!.id);
              return exists ? prev.map((p) => (p.id === match!.id ? match! : p)) : [match!, ...prev];
            });
          }
        } catch {
          // ignore lookup errors and fall back to "not found"
        }
      }

      if (match) {
        addToCart(match);
        setScanMessage(language === 'ar' ? 'تمت إضافة المنتج' : 'Product added to cart.');
      } else {
        setScanMessage(language === 'ar' ? 'لم يتم العثور على المنتج' : 'Product not found.');
      }

      // Ready for the next scan
      setScanValue('');
      scanInputRef.current?.focus();
    })();
  };

  useEffect(() => {
    handleScanMatchRef.current = handleScanMatch;
  }, [handleScanMatch]);

  // Keyboard-wedge barcode scanners: capture fast key sequences + auto-add to cart
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SCAN_IDLE_MS = 250;
    const SCAN_INTER_CHAR_MS = 80;
    const SCAN_MIN_CHARS = 3;

    const isEditable = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase?.() || '';
      return tag === 'input' || tag === 'textarea' || (el as any).isContentEditable;
    };

    const restoreTargetValue = () => {
      const session = scanSessionRef.current;
      const target = session.target as any;
      if (!target || session.targetValue === null) return;
      if (typeof target.value === 'string') {
        try {
          target.value = session.targetValue;
        } catch {
          // ignore
        }
      }
    };

    const reset = () => {
      scanSessionRef.current.buffer = '';
      scanSessionRef.current.lastTs = 0;
      scanSessionRef.current.scanning = false;
      scanSessionRef.current.target = null;
      scanSessionRef.current.targetValue = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const scanInput = scanInputRef.current;

      // Let the dedicated scan input handle manual typing/Enter
      if (scanInput && active === scanInput) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;
      const isTerminator = key === 'Enter' || key === 'Tab';
      const isChar = key.length === 1;

      const session = scanSessionRef.current;

      if (isTerminator) {
        const code = session.buffer.trim();
        if (session.scanning && code.length >= SCAN_MIN_CHARS) {
          // Prevent the terminator from submitting forms / adding newlines
          e.preventDefault();
          e.stopPropagation();

          restoreTargetValue();
          reset();

          handleScanMatchRef.current(code);
          scanInputRef.current?.focus();
          return;
        }
        reset();
        return;
      }

      if (!isChar) return;

      const now = e.timeStamp || Date.now();
      const gap = session.lastTs ? now - session.lastTs : 0;

      if (!session.buffer || gap > SCAN_IDLE_MS) {
        session.buffer = key;
        session.lastTs = now;
        session.scanning = false;
        session.target = active;
        session.targetValue = isEditable(active) ? String((active as any).value ?? '') : null;
        return;
      }

      session.buffer += key;
      session.lastTs = now;

      if (!session.scanning && gap > 0 && gap <= SCAN_INTER_CHAR_MS && session.buffer.length >= SCAN_MIN_CHARS) {
        session.scanning = true;
      }

      if (session.scanning) {
        // Stop the scanner from polluting whichever input currently has focus
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.productId === productId);
      if (!item) return prev;

      const product = products.find((p) => p.id === productId);
      if (!product) return prev;

      const newQuantity = item.quantity + delta;
      if (newQuantity <= 0) {
        return prev.filter((i) => i.productId !== productId);
      }
      if (newQuantity > (product.available_stock ?? product.stock_quantity)) return prev;

      return prev.map((i) =>
        i.productId === productId ? { ...i, quantity: newQuantity, total: newQuantity * i.price } : i
      );
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const total = cart.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const handleInvoicePayment = async () => {
    if (cart.length === 0) return;
    try {
      const items = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
      }));

      const sale = await apiRequest('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          items,
          paymentMethod: 'invoice',
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
        }),
      });

      let printCount = 0;
      try {
        const printInfo = await apiRequest(`/invoices/${sale.saleId}/print`, { method: 'POST' });
        printCount = Number(printInfo?.printCount || 0);
      } catch {
        // If print counter fails, still print the receipt
      }

      printReceipt(sale, printCount);
      clearCart();
      setCustomer({ name: '', phone: '', address: '' });
      loadProducts();
    } catch (error) {
      console.error('Invoice print failed:', error);
      alert(language === 'ar' ? 'فشلت العملية' : 'Payment failed');
    }
  };

  const handleCashPayment = async () => {
    if (cart.length === 0) return;

    try {
      const items = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.price,
      }));

      const sale = await apiRequest('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          items,
          paymentMethod: 'cash',
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
        }),
      });

      let printCount = 0;
      try {
        const printInfo = await apiRequest(`/invoices/${sale.saleId}/print`, { method: 'POST' });
        printCount = Number(printInfo?.printCount || 0);
      } catch {
        // If print counter fails, still print the receipt
      }

      // Print receipt
      printReceipt(sale, printCount);

      // Clear cart
      clearCart();
      setCustomer({ name: '', phone: '', address: '' });

      // Reload products to update stock
      loadProducts();
    } catch (error) {
      console.error('Payment failed:', error);
      alert(language === 'ar' ? 'فشلت العملية' : 'Payment failed');
    }
  };

  const printReceipt = (sale: any, printCount?: number) => {
    setIsPrinting(true);

    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) {
      setIsPrinting(false);
      return;
    }

    const duplicateLabel =
      printCount && printCount > 1 ? `Duplicate Copy No. ${Math.max(1, printCount - 1)}` : '';

    const receiptHTML = `
      <!DOCTYPE html>
      <html dir="${language === 'ar' ? 'rtl' : 'ltr'}" lang="${language}">
        <head>
          <meta charset="UTF-8">
          <title>Receipt - ${sale.invoiceNumber || sale.saleId}</title>
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
            .items {
              margin-bottom: 25px;
            }
            .item {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #e5e7eb;
              font-size: 13px;
            }
            .item-name {
              flex: 1;
              color: #111827;
            }
            .item-qty {
              margin: 0 15px;
              color: #6b7280;
            }
            .item-price {
              color: #111827;
              font-weight: 700;
            }
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
              .receipt {
                max-width: 80mm;
              }
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
                <p>Invoice # / رقم الفاتورة: ${sale.invoiceNumber || sale.saleId}</p>
                <p>Date / التاريخ: ${new Date().toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}</p>
                <p>Cashier / الكاشير: ${user?.username || 'N/A'}</p>
                <p>Customer / العميل: ${customer.name || '-'}</p>
                ${business?.address ? `<p>Address / العنوان: ${business.address}</p>` : ''}
                ${business?.contact_phone ? `<p>Phone / الهاتف: ${business.contact_phone}</p>` : ''}
              </div>
              <div class="items">
                <div class="item" style="font-weight: 700;">
                  <span class="item-name">Item / الصنف</span>
                  <span class="item-qty">Qty / الكمية</span>
                  <span class="item-price">Price / السعر</span>
                </div>
                ${cart.map((item) => `
                  <div class="item">
                    <span class="item-name">${item.name}</span>
                    <span class="item-qty">${item.quantity}x</span>
                    <span class="item-price">${item.total.toFixed(2)} ${symbol}</span>
                  </div>
                `).join('')}
              </div>
            <div class="total">
              <span>Total / الإجمالي</span>
              <span>${total.toFixed(2)} ${symbol}</span>
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
      setIsPrinting(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-cyan-200">{t('pos.title')}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Categories & Products */}
          <div className="lg:col-span-2 space-y-6">
            <div className="neon-box rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={scanInputRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && scanValue.trim()) {
                      handleScanMatch(scanValue.trim());
                      setScanValue('');
                    }
                  }}
                  placeholder={language === 'ar' ? 'امسح الباركود أو اكتب الكود' : 'Scan or type barcode/SKU'}
                  className="flex-1 bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => setScanOpen(true)}
                  className="px-4 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 text-sm"
                >
                  {language === 'ar' ? 'مسح بالكاميرا' : 'Scan with camera'}
                </button>
              </div>
              {scanMessage && <div className="mt-2 text-xs text-slate-400">{scanMessage}</div>}
            </div>
            {/* Categories */}
            <div className="neon-box rounded-xl p-4">
              <h2 className="text-xl font-bold mb-4 text-cyan-400">{t('pos.categories')}</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-2 rounded-lg transition ${
                    selectedCategory === 'all'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {language === 'ar' ? 'الكل' : 'All'}
                </button>
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg transition ${
                      selectedCategory === cat.id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {language === 'ar' ? cat.name_ar : cat.name_en}
                  </button>
                ))}
                {hasUncategorized && (
                  <button
                    onClick={() => setSelectedCategory('uncategorized')}
                    className={`px-4 py-2 rounded-lg transition ${
                      selectedCategory === 'uncategorized'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {language === 'ar' ? 'غير مصنف' : 'Uncategorized'}
                  </button>
                )}
              </div>
            </div>

            {/* Products Grid */}
            <div className="neon-box rounded-xl p-4">
              <h2 className="text-xl font-bold mb-4 text-cyan-400">{t('pos.products')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={(product.available_stock ?? product.stock_quantity) <= 0}
                    className="p-4 bg-[#0d1422] rounded-xl hover:bg-[#111a2b] transition text-right disabled:opacity-50 disabled:cursor-not-allowed border border-cyan-500/20 hover:border-cyan-400/50"
                  >
                    <div className="h-20 w-full rounded-lg border border-cyan-500/30 bg-black/60 flex items-center justify-center mb-3">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt={product.name_ar} className="h-16 object-contain" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-cyan-400/60" />
                      )}
                    </div>
                    <h3 className="font-bold text-white mb-1 flex items-center gap-2">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.image_url}
                          alt={product.name_ar}
                          className="h-8 w-8 rounded-md object-cover border border-cyan-500/20"
                        />
                      ) : (
                        <span className="h-8 w-8 rounded-md border border-cyan-500/20 flex items-center justify-center text-cyan-300/60">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )}
                      <span>{language === 'ar' ? product.name_ar : product.name_en}</span>
                    </h3>
                    <p className="text-sm text-gray-400 mb-2">{product.brand}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-cyan-400 font-bold">
                        {Number(product.sell_price || 0).toFixed(2)} {symbol}
                      </span>
                      <span className={`text-xs ${(product.available_stock ?? product.stock_quantity) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(product.available_stock ?? product.stock_quantity)} {t('pos.inStock')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cart */}
          <div className="lg:col-span-1">
            <div className="neon-card rounded-xl p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  {t('pos.cart')}
                </h2>
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    {t('pos.cartEmpty')}
                  </p>
                ) : (
                  cart.map((item) => (
                    <div key={item.productId} className="bg-gray-800 p-3 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-white flex-1">{item.name}</h4>
                        <button onClick={() => removeFromCart(item.productId)} className="text-red-400 hover:text-red-300 ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.productId, -1)}
                            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-sm"
                          >
                            -
                          </button>
                          <span className="text-white font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, 1)}
                            className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-sm"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-cyan-400 font-bold">
                          {Number(item.total || 0).toFixed(2)} {symbol}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-gray-700 pt-4 mb-4">
                <div className="space-y-2 mb-4">
                  <input
                    className="w-full bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                    placeholder={language === 'ar' ? 'اسم العميل' : 'Customer name'}
                    value={customer.name}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    className="w-full bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                    placeholder={language === 'ar' ? 'هاتف العميل' : 'Customer phone'}
                    value={customer.phone}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                  <input
                    className="w-full bg-[#0f172a] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm"
                    placeholder={language === 'ar' ? 'عنوان العميل' : 'Customer address'}
                    value={customer.address}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-bold">{t('pos.total')}:</span>
                  <span className="text-2xl font-bold text-cyan-400">
                    {total.toFixed(2)} {symbol}
                  </span>
                </div>
              </div>

              <button
                onClick={handleInvoicePayment}
                disabled={cart.length === 0 || isPrinting}
                className="w-full mb-3 bg-gradient-to-r from-fuchsia-600 to-cyan-600 hover:from-fuchsia-500 hover:to-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
                style={{ boxShadow: '0 0 18px rgba(236,72,153,0.35)' }}
              >
                🧾 {t('pos.printInvoice')}
              </button>

              <button
                onClick={handleCashPayment}
                disabled={cart.length === 0 || isPrinting}
                className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-bold py-4 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                style={{ boxShadow: '0 0 20px rgba(0, 243, 255, 0.5)' }}
              >
                {isPrinting ? (
                  <>
                    <Printer className="w-5 h-5 animate-pulse" />
                    {t('pos.printing')}
                  </>
                ) : (
                  <>💵 {t('pos.cash')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={handleScanMatch}
        onError={(message) => {
          // If camera scanning isn't available, keep POS ready for scanner guns.
          setScanMessage(
            language === 'ar'
              ? 'الكاميرا مش مدعومة هنا — استخدم جهاز الباركود أو اكتب الكود.'
              : message || 'Camera scan unavailable — use a scanner gun or type the code.'
          );
          setScanOpen(false);
          scanInputRef.current?.focus();
        }}
      />
    </div>
  );
}

