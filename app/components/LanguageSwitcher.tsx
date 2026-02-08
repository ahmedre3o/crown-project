'use client';

import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center gap-2 bg-[#0a0f18] border border-cyan-500/40 rounded-full px-2 py-1 shadow-[0_0_12px_rgba(0,243,255,0.25)]">
      <button
        onClick={() => setLanguage('ar')}
        className={`px-3 py-1 rounded-full text-xs font-bold transition ${
          language === 'ar'
            ? 'bg-cyan-500 text-black'
            : 'text-cyan-300 hover:text-cyan-200'
        }`}
      >
        AR
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded-full text-xs font-bold transition ${
          language === 'en'
            ? 'bg-cyan-500 text-black'
            : 'text-cyan-300 hover:text-cyan-200'
        }`}
      >
        EN
      </button>
    </div>
  );
}

