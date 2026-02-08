'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type CurrencyCode =
  | 'EGP'
  | 'SAR'
  | 'USD'
  | 'AED'
  | 'KWD'
  | 'QAR'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'INR'
  | 'CNY'
  | 'TRY';

const currencySymbols: Record<CurrencyCode, string> = {
  EGP: 'ج.م',
  SAR: 'ر.س',
  USD: '$',
  AED: 'د.إ',
  KWD: 'د.ك',
  QAR: 'ر.ق',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  INR: '₹',
  CNY: '¥',
  TRY: '₺',
};

interface CurrencyContextType {
  currency: CurrencyCode;
  symbol: string;
  setCurrency: (code: CurrencyCode) => void;
  format: (value: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function detectCurrency(): CurrencyCode {
  if (typeof navigator === 'undefined') return 'SAR';
  const locale = navigator.language || 'ar-SA';
  if (locale.startsWith('ar-EG')) return 'EGP';
  if (locale.startsWith('ar-SA')) return 'SAR';
  if (locale.startsWith('ar-AE')) return 'AED';
  if (locale.startsWith('ar-KW')) return 'KWD';
  if (locale.startsWith('ar-QA')) return 'QAR';
  if (locale.startsWith('en-GB')) return 'GBP';
  if (locale.startsWith('de') || locale.startsWith('fr') || locale.startsWith('es')) return 'EUR';
  if (locale.startsWith('ja')) return 'JPY';
  return 'USD';
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>('SAR');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('currency') as CurrencyCode | null;
    setCurrencyState(saved || detectCurrency());
  }, []);

  const setCurrency = (code: CurrencyCode) => {
    setCurrencyState(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem('currency', code);
    }
  };

  const symbol = useMemo(() => currencySymbols[currency], [currency]);

  const format = (value: number) =>
    new Intl.NumberFormat('ar', { style: 'currency', currency }).format(value);

  return (
    <CurrencyContext.Provider value={{ currency, symbol, setCurrency, format }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
};

