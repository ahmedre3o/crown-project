'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/store-admin/reports');
  }, [router]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-cyan-300">{typeof window !== 'undefined' ? 'Redirecting...' : ''}</p>
    </div>
  );
}
