'use client';

import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export function CyberpunkClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      setDate(
        now.toLocaleDateString('ar-SA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 bg-[#0a0f18] border border-cyan-500/40 rounded-full px-4 py-2 shadow-[0_0_12px_rgba(0,243,255,0.25)]">
      <Clock className="h-4 w-4 text-cyan-400" />
      <div className="text-right leading-tight">
        <div className="text-cyan-200 text-sm font-semibold">{time}</div>
        <div className="text-[10px] text-slate-400">{date}</div>
      </div>
    </div>
  );
}

