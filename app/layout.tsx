import React from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Crown Services ERP',
  description: 'SaaS ERP system for Crown Services',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-black text-white min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

