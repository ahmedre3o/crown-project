'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingCart, Package, Star } from 'lucide-react';
import { apiUrl } from '../../api-config';

interface Product {
  id: number;
  name_en: string;
  name_ar: string;
  brand: string;
  sell_price: number;
  category_name_en?: string;
  category_name_ar?: string;
}

interface StorefrontData {
  shop: {
    id: number;
    name: string;
    package: string;
  };
  products: Product[];
}

export default function StorefrontPage() {
  const params = useParams();
  const shopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;
  const [data, setData] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [cart, setCart] = useState<number[]>([]);

  useEffect(() => {
    if (shopId) {
      loadStorefront();
    }
  }, [shopId]);

  const loadStorefront = async () => {
    try {
      const response = await fetch(apiUrl(`/public/storefront/${shopId}`));
      if (!response.ok) {
        throw new Error('Storefront not available');
      }
      const storefrontData = await response.json();
      setData(storefrontData);
    } catch (error) {
      console.error('Failed to load storefront:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (productId: number) => {
    setCart((prev) => [...prev, productId]);
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((id) => id !== productId));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-cyan-400 text-xl">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-400 mb-4">Storefront Not Available</h1>
          <p className="text-gray-400">This shop does not have a public storefront.</p>
        </div>
      </div>
    );
  }

  const cartCount = cart.length;
  const cartItems = data.products.filter((p) => cart.includes(p.id));

  return (
    <div className="min-h-screen bg-black text-white" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-gray-900 border-b border-cyan-500 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold neon-text">CROWN</h1>
            <p className="text-xs text-cyan-400 uppercase">{data.shop.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition"
            >
              {language === 'en' ? 'AR' : 'EN'}
            </button>
            <div className="relative">
              <button className="p-2 bg-cyan-600 rounded-lg hover:bg-cyan-500 transition relative">
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 py-20 border-b border-cyan-500/30">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold mb-4 neon-text">
            {language === 'ar' ? 'مرحباً بكم في' : 'Welcome to'} {data.shop.name}
          </h2>
          <p className="text-xl text-gray-400">
            {language === 'ar' ? 'أفضل قطع الغيار والخدمات للسيارات' : 'Premium Auto Parts & Services'}
          </p>
        </div>
      </section>

      {/* Products Grid */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-3xl font-bold neon-text">
            {language === 'ar' ? 'المنتجات المتاحة' : 'Available Products'}
          </h3>
          <div className="flex items-center gap-2 text-cyan-400">
            <Package className="w-5 h-5" />
            <span>{data.products.length} {language === 'ar' ? 'منتج' : 'products'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {data.products.map((product) => {
            const inCart = cart.includes(product.id);
            return (
              <div key={product.id} className="neon-box rounded-xl p-6 hover:scale-105 transition-transform">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    {product.category_name_en && (
                      <span className="text-xs text-purple-400 uppercase">
                        {language === 'ar' ? product.category_name_ar : product.category_name_en}
                      </span>
                    )}
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-1">
                    {language === 'ar' ? product.name_ar : product.name_en}
                  </h4>
                  <p className="text-sm text-gray-400">{product.brand}</p>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold text-cyan-400">
                    {product.sell_price.toFixed(2)} {language === 'ar' ? 'ر.س' : 'SAR'}
                  </span>
                  <button
                    onClick={() => (inCart ? removeFromCart(product.id) : addToCart(product.id))}
                    className={`px-4 py-2 rounded-lg font-medium transition ${
                      inCart ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                  >
                    {inCart ? (language === 'ar' ? 'إزالة' : 'Remove') : (language === 'ar' ? 'إضافة' : 'Add')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cart Sidebar */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 right-6 bg-gray-900 border border-cyan-500 rounded-lg p-6 max-w-sm shadow-2xl">
          <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {language === 'ar' ? 'السلة' : 'Cart'} ({cartCount})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {cartItems.map((product) => (
              <div key={product.id} className="flex justify-between items-center bg-gray-800 p-2 rounded">
                <span className="text-sm">{language === 'ar' ? product.name_ar : product.name_en}</span>
                <span className="text-cyan-400 font-bold">
                  {product.sell_price.toFixed(2)} {language === 'ar' ? 'ر.س' : 'SAR'}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-700 pt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">{language === 'ar' ? 'الإجمالي' : 'Total'}:</span>
              <span className="text-2xl font-bold text-cyan-400">
                {cartItems.reduce((sum, p) => sum + p.sell_price, 0).toFixed(2)} {language === 'ar' ? 'ر.س' : 'SAR'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-cyan-500 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center">
          <p className="text-gray-400">
            {language === 'ar' ? '© 2024 تاج الخدمات. جميع الحقوق محفوظة.' : '© 2024 Crown Services. All rights reserved.'}
          </p>
        </div>
      </footer>
    </div>
  );
}

