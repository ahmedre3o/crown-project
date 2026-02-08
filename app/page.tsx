'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/AuthContext';
import { apiUrl } from './api-config';

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/dashboard');
    } else {
      // If this host is a verified/active storefront domain, route to public storefront.
      const checkStorefront = async () => {
        try {
          const host = typeof window !== 'undefined' ? window.location.host : '';
          const response = await fetch(apiUrl('/public/storefront'), {
            headers: { 'x-shop-domain': host },
          });
          if (response.ok) {
            router.replace('/storefront');
            return;
          }
        } catch {
          // ignore
        }
        router.replace('/login');
      };
      void checkStorefront();
    }
  }, [loading, user, router]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold neon-text">CROWN</h1>
        <p className="text-sm text-cyan-400 uppercase tracking-widest">Services System</p>
        <div className="text-gray-400">Initializing...</div>
      </div>
    </main>
  );
}

