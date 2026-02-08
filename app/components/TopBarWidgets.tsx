'use client';

import React from 'react';
import { CyberpunkClock } from './CyberpunkClock';
import { LanguageSwitcher } from './LanguageSwitcher';

export function TopBarWidgets() {
  return (
    <div className="fixed top-4 left-4 z-50 flex items-center gap-3">
      <CyberpunkClock />
      <LanguageSwitcher />
    </div>
  );
}

