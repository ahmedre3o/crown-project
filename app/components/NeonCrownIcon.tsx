'use client';

import React from 'react';

/** Real CROWN SVG (not star). Crown shape: base band + 5 peaks (left, left-center, center, right-center, right). */
export function NeonCrownIcon({ className = 'h-5 w-5', size }: { className?: string; size?: number }) {
  const s = size ?? 20;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-cyan-200 ${className}`}
      style={{
        animation: 'crown-pulse 2s ease-in-out infinite',
      }}
    >
      {/* Crown: base band + 5 peaks (left peak, left-center, center (highest), right-center, right peak) */}
      <path
        d="M2 20 L4 14 L8 16 L12 5 L16 16 L20 14 L22 20 L2 20 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
