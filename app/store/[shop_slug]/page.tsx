'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function StorePreviewRedirectPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const raw = (params as any)?.shop_slug;
    const shopSlug = Array.isArray(raw) ? raw[0] : raw;
    if (!shopSlug) return;
    router.replace(`/storefront?preview=${encodeURIComponent(String(shopSlug))}`);
  }, [params, router]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-cyan-400 text-sm">Loading preview...</div>
    </main>
  );
}

