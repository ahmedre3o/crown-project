'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, MessageCircle, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { apiUrl } from '../api-config';

type Message = { role: 'user' | 'assistant'; content: string };

export function AIAssistant() {
  const { t, direction, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [voiceInputLang, setVoiceInputLang] = useState<'ar' | 'en'>(language === 'ar' ? 'ar' : 'en');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = () => setOpen(true);
    window.addEventListener('crown:open-ai', handler);

    try {
      const shouldOpen = localStorage.getItem('crown-open-ai') === 'true';
      if (shouldOpen) {
        localStorage.removeItem('crown-open-ai');
        setOpen(true);
      }
    } catch {
      // ignore storage errors
    }

    return () => window.removeEventListener('crown:open-ai', handler);
  }, []);

  useEffect(() => {
    setVoiceInputLang(language === 'ar' ? 'ar' : 'en');
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = voiceInputLang === 'en' ? 'en-US' : 'ar-EG';
    recognition.interimResults = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      setInput(text);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, [voiceInputLang]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/chat'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(errorText);
        return;
      }
      const data = await response.json();
      const reply = data?.message || data?.text || '...';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (data?.lang === 'ar' || data?.lang === 'en') {
        setVoiceInputLang(data.lang);
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore cancel errors
        }
        const utter = new SpeechSynthesisUtterance(reply);
        const detectedLang = data?.lang === 'ar' || data?.lang === 'en' ? data.lang : null;
        const ttsLang =
          (typeof data?.ttsLang === 'string' && data.ttsLang) ||
          (detectedLang === 'en' ? 'en-US' : detectedLang === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'ar-EG');
        utter.lang = ttsLang;

        // Best-effort voice match
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferred =
          voices.find((v) => v.lang === ttsLang) ||
          voices.find((v) => v.lang?.toLowerCase?.().startsWith(ttsLang.split('-')[0].toLowerCase())) ||
          null;
        if (preferred) {
          utter.voice = preferred;
        }
        window.speechSynthesis.speak(utter);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'حدث خطأ أثناء الاتصال بالمساعد.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-50 h-14 w-14 rounded-full bg-cyan-600 text-white shadow-[0_0_20px_rgba(0,243,255,0.5)] flex items-center justify-center"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-6 left-6 z-50 w-96 max-w-[90vw] bg-[#0b1220] border border-cyan-500/40 rounded-2xl shadow-[0_0_25px_rgba(0,243,255,0.35)] flex flex-col"
          dir={direction}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold">
              <MessageCircle className="h-4 w-4" />
              <span>{t('ai.title')}</span>
              <span className="text-xs text-cyan-300/70">— أنا تحت أمرك</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-cyan-300 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`text-sm px-3 py-2 rounded-xl ${
                  m.role === 'user'
                    ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30'
                    : 'bg-fuchsia-500/10 text-slate-200 border border-fuchsia-500/30'
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="text-xs text-cyan-300">...</div>
            )}
          </div>

          <div className="p-3 border-t border-cyan-500/20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!recognitionRef.current || listening) return;
                try {
                  recognitionRef.current.stop();
                } catch {
                  // ignore stop errors
                }
                setListening(true);
                try {
                  recognitionRef.current.start();
                } catch {
                  setListening(false);
                }
              }}
              className={`h-10 w-10 rounded-xl flex items-center justify-center border border-cyan-500/30 ${
                listening ? 'bg-cyan-500/30 text-cyan-100' : 'text-cyan-300'
              }`}
              title={t('ai.voice')}
            >
              <Mic className="h-4 w-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.placeholder')}
              className="flex-1 bg-[#0f172a] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={loading}
              className="h-10 px-4 rounded-xl bg-cyan-600 text-white flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {t('ai.send')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

