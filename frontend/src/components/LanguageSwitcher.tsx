import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded text-sm font-medium transition ${
          language === 'en'
            ? 'bg-cyan-500 text-black'
            : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('ar')}
        className={`px-3 py-1 rounded text-sm font-medium transition ${
          language === 'ar'
            ? 'bg-cyan-500 text-black'
            : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
      >
        AR
      </button>
    </div>
  );
};
