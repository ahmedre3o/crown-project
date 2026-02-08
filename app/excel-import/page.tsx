'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { Sidebar } from '../components/Sidebar';
import { useLanguage } from '../contexts/LanguageContext';
import { apiUrl } from '../api-config';

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  detectedHeaders?: string[];
  normalizedHeaders?: string[];
  inferredMap?: Record<string, string | null>;
  autoMappingSuggestions?: Record<string, string | null>;
  headerToCanonical?: Record<string, string>;
  mappingConfidence?: number;
  conflicts?: string[];
  totalRowsDetected?: number;
  rowsCount?: number;
  sheetNames?: string[];
  previewRows?: Record<string, string | null>[];
  strictMatch?: boolean;
  warnings?: string[];
};

type ImportResponse = {
  ok: boolean;
  error?: string;
  inserted?: number;
  updated?: number;
  skippedCount?: number;
  failedCount?: number;
  batchId?: number | null;
  skipped?: Array<{ row: number; reason: string }>;
  warnings?: string[];
  messageAr?: string;
};

const CANONICAL_OPTIONS = [
  { value: 'ignore', labelAr: 'تخطي', labelEn: 'Skip' },
  { value: 'name', labelAr: 'الاسم', labelEn: 'Name', required: true },
  { value: 'nameAr', labelAr: 'الاسم عربي', labelEn: 'Name (AR)' },
  { value: 'brand', labelAr: 'العلامة', labelEn: 'Brand' },
  { value: 'category', labelAr: 'التصنيف', labelEn: 'Category' },
  { value: 'sellPrice', labelAr: 'سعر البيع', labelEn: 'Sell Price' },
  { value: 'buyPrice', labelAr: 'سعر الشراء', labelEn: 'Buy Price' },
  { value: 'stockQuantity', labelAr: 'الكمية', labelEn: 'Stock' },
  { value: 'sku', labelAr: 'SKU', labelEn: 'SKU' },
  { value: 'barcode', labelAr: 'الباركود', labelEn: 'Barcode' },
  { value: 'qrCode', labelAr: 'QR', labelEn: 'QR Code' },
  { value: 'imageUrl', labelAr: 'رابط الصورة', labelEn: 'Image URL' },
];

export default function ExcelImportPage() {
  const { t, direction, language } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<File | null>(null);
  const [step, setStep] = useState<'idle' | 'analyzing' | 'summary' | 'mapping' | 'importing' | 'done'>('idle');
  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestStatus, setLastRequestStatus] = useState<string>('');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [mappingConfirmed, setMappingConfirmed] = useState(false);

  const buildHeaders = () => {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.shopId) headers['x-shop-id'] = String(u.shopId);
      }
    } catch {
      // ignore
    }
    return headers;
  };

  const downloadTemplate = async () => {
    try {
      const res = await fetch(apiUrl('/products/import/template'), { headers: buildHeaders() });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Download failed');
    }
  };

  const runAnalyze = async () => {
    const f = file ?? fileRef.current;
    if (!f) {
      setError(language === 'ar' ? 'لم يتم اختيار ملف' : 'No file selected');
      return;
    }
    setError(null);
    setLoading(true);
    setStep('analyzing');
    setLastRequestStatus('');
    try {
      const form = new FormData();
      form.append('mode', 'analyze');
      form.append('file', f, f.name);
      const url = apiUrl(`/products/import?mode=analyze&sheet=${sheetIndex}&headerRow=${headerRowIndex}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(),
        body: form,
      });
      const data: AnalyzeResponse = await res.json().catch(() => ({}));
      setLastRequestStatus(`${res.status} ${res.statusText}`);
      if (data.ok === false || !res.ok) {
        setError(data.error || 'Analyze failed');
        setStep('idle');
        return;
      }
      setAnalyze(data);
      const ht = data.headerToCanonical || {};
      setColumnMapping(ht);
      const needsMapping = !data.strictMatch && (data.detectedHeaders?.length ?? 0) > 0;
      setMappingConfirmed(!!data.strictMatch);
      setStep(needsMapping ? 'mapping' : 'summary');
    } catch (e: any) {
      setLastRequestStatus(`Error: ${e?.message || 'unknown'}`);
      setError(e?.message || 'Analyze failed');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  const runImport = async (mapping?: Record<string, string>) => {
    const f = file ?? fileRef.current;
    if (!f) {
      alert(language === 'ar' ? 'لم يتم اختيار ملف. يرجى اختيار ملف أولاً.' : 'No file selected.');
      return;
    }
    setError(null);
    setLoading(true);
    setStep('importing');
    setLastRequestStatus('');
    try {
      const form = new FormData();
      form.append('mode', 'import');
      form.append('file', f, f.name);
      const mapToUse = mapping ?? columnMapping;
      if (Object.keys(mapToUse).length > 0) {
        form.append('mapping', JSON.stringify(mapToUse));
      }
      const url = apiUrl(`/products/import?mode=import&sheet=${sheetIndex}&headerRow=${headerRowIndex}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(),
        body: form,
      });
      const data: ImportResponse = await res.json().catch(() => ({}));
      setLastRequestStatus(`${res.status} ${res.statusText}`);
      if (data.ok === false || !res.ok) {
        setError(data.error || 'Import failed');
        setStep(step === 'mapping' ? 'mapping' : 'summary');
        return;
      }
      setImportResult(data);
      window.dispatchEvent(new CustomEvent('products-imported'));
      setStep('done');
    } catch (e: any) {
      setLastRequestStatus(`Error: ${e?.message || 'unknown'}`);
      setError(e?.message || 'Import failed');
      setStep(step === 'mapping' ? 'mapping' : 'summary');
    } finally {
      setLoading(false);
    }
  };

  const confirmMappingAndImport = () => {
    const hasName = Object.values(columnMapping).some((v) => v === 'name');
    if (!hasName) {
      alert(language === 'ar' ? 'الاسم مطلوب على الأقل. حدد عمود للاسم.' : 'Name is required. Map a column to Name.');
      return;
    }
    setMappingConfirmed(true);
    setStep('summary');
  };

  const reset = () => {
    setFile(null);
    fileRef.current = null;
    setAnalyze(null);
    setImportResult(null);
    setError(null);
    setLastRequestStatus('');
    setColumnMapping({});
    setMappingConfirmed(false);
    setStep('idle');
  };

  const hasNameMapped = Object.values(columnMapping).some((v) => v === 'name');
  const confidence = analyze?.mappingConfidence ?? 0;
  const showConfirmation = confidence > 0 && confidence < 100;

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-y-auto">
        <h1 className="text-2xl font-bold text-cyan-200 mb-6">{t('excel.title')}</h1>
        <div className="neon-card rounded-xl p-6 max-w-4xl">
          <p className="text-slate-300 text-sm mb-4">
            {language === 'ar'
              ? 'رفع ملف Excel أو CSV. يدعم المطابقة التلقائية، التخطيط اليدوي، والاستيراد الجزئي مع تصحيح الأخطاء.'
              : 'Upload Excel or CSV. Supports auto-mapping, manual mapping, partial import, and error correction.'}
          </p>

          {/* Mode 1: Template download */}
          <div className="mb-6">
            <button
              type="button"
              onClick={downloadTemplate}
              className="px-4 py-2 rounded-lg border border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/10 text-sm"
            >
              {language === 'ar' ? 'تحميل قالب Excel' : 'Download Excel Template'}
            </button>
          </div>

          <div className="space-y-4">
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  fileRef.current = f;
                  setError(null);
                  setStep('idle');
                }
              }}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-white"
            />
            {(file ?? fileRef.current) && (step === 'idle' || step === 'mapping' || step === 'summary') && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-slate-400 text-sm">{(file ?? fileRef.current)?.name}</span>
                {(analyze?.sheetNames?.length ?? 0) > 1 && (
                  <div className="flex items-center gap-2">
                    <label className="text-slate-400 text-sm">{language === 'ar' ? 'الورقة:' : 'Sheet:'}</label>
                    <select
                      value={sheetIndex}
                      onChange={(e) => { setSheetIndex(parseInt(e.target.value, 10)); setStep('idle'); }}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                    >
                      {analyze?.sheetNames?.map((s, i) => (
                        <option key={i} value={i}>{s || `Sheet ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 text-sm">{language === 'ar' ? 'صف العناوين:' : 'Header row:'}</label>
                  <select
                    value={headerRowIndex}
                    onChange={(e) => { setHeaderRowIndex(parseInt(e.target.value, 10)); setStep('idle'); }}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <option key={i} value={i}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={runAnalyze}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {step === 'idle' ? (language === 'ar' ? 'تحليل' : 'Analyze') : (language === 'ar' ? 'إعادة التحليل' : 'Re-analyze')}
                </button>
              </div>
            )}
          </div>

          {loading && (
            <p className="text-slate-400 text-sm mt-4">{language === 'ar' ? 'جاري المعالجة...' : 'Processing...'}</p>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Mode 2/3: Mapping UI */}
          {step === 'mapping' && analyze && (
            <div className="mt-6 space-y-4">
              <h3 className="text-cyan-200 font-semibold">
                {language === 'ar' ? 'ربط الأعمدة' : 'Column Mapping'}
              </h3>
              {showConfirmation && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm">
                  {language === 'ar'
                    ? `ثقة المطابقة: ${confidence}%. يرجى التأكيد قبل الاستيراد.`
                    : `Mapping confidence: ${confidence}%. Please confirm before import.`}
                </div>
              )}
              {analyze.conflicts && analyze.conflicts.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
                  {language === 'ar' ? 'تعارض: عمودان أو أكثر يطابقان نفس الحقل:' : 'Conflict: multiple columns map to same field:'}{' '}
                  {analyze.conflicts.join(', ')}
                </div>
              )}
              <div className="space-y-3">
                {(analyze.detectedHeaders ?? []).map((header) => (
                  <div key={header} className="flex items-center gap-4 flex-wrap">
                    <span className="text-slate-300 min-w-[140px] truncate" title={header}>
                      {header}
                    </span>
                    <span className="text-slate-500">→</span>
                    <select
                      value={columnMapping[header] ?? 'ignore'}
                      onChange={(e) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [header]: e.target.value,
                        }))
                      }
                      className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm min-w-[160px]"
                    >
                      {CANONICAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {language === 'ar' ? opt.labelAr : opt.labelEn}
                          {opt.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!hasNameMapped && (
                <p className="text-amber-200 text-sm">
                  {language === 'ar' ? 'الاسم مطلوب. حدد عموداً للاسم.' : 'Name is required. Map a column to Name.'}
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setStep('idle')}
                  className="px-4 py-2 rounded-lg border border-slate-500 text-slate-300 text-sm"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={confirmMappingAndImport}
                  disabled={!hasNameMapped}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm disabled:opacity-50"
                >
                  {language === 'ar' ? 'تأكيد و متابعة' : 'Confirm & Continue'}
                </button>
                <button
                  type="button"
                  onClick={() => runImport(columnMapping)}
                  disabled={!hasNameMapped || loading}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm disabled:opacity-50"
                >
                  {language === 'ar' ? 'استيراد مباشرة' : 'Import Now'}
                </button>
              </div>
            </div>
          )}

          {/* Summary (Mode 0 strict or after mapping confirmation) */}
          {step === 'summary' && analyze && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-cyan-500/20 bg-black/20 p-4">
                <h3 className="text-cyan-200 font-semibold mb-2">
                  {language === 'ar' ? 'ملخص التحليل' : 'Analysis summary'}
                </h3>
                <p className="text-slate-300 text-sm">
                  {language === 'ar' ? 'عدد الصفوف:' : 'Rows:'} <strong>{analyze.totalRowsDetected ?? analyze.rowsCount ?? 0}</strong>
                </p>
                <p className="text-slate-300 text-sm">
                  {language === 'ar' ? 'الأعمدة:' : 'Columns:'}{' '}
                  {(analyze.detectedHeaders ?? []).slice(0, 12).join(', ')}
                  {(analyze.detectedHeaders?.length ?? 0) > 12 ? '…' : ''}
                </p>
                {analyze.strictMatch && (
                  <p className="text-green-400 text-sm mt-2">
                    {language === 'ar' ? 'مطابقة كاملة – جاهز للاستيراد' : 'Full match – ready to import'}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-600/50 bg-slate-900/50 p-4 text-xs text-slate-400">
                <h4 className="text-slate-300 font-medium mb-2">{language === 'ar' ? 'لوحة تصحيح' : 'Debug panel'}</h4>
                <p>File: {(file ?? fileRef.current)?.name ?? '—'}</p>
                <p>Size: {((file ?? fileRef.current)?.size ?? 0) > 0 ? `${(((file ?? fileRef.current)?.size ?? 0) / 1024).toFixed(1)} KB` : '—'}</p>
                <p>Last request: {lastRequestStatus || '—'}</p>
                <p>Rows: {analyze.totalRowsDetected ?? 0}</p>
                <p>Columns: {(analyze.detectedHeaders ?? []).length}</p>
              </div>
              {analyze.previewRows && analyze.previewRows.length > 0 && (
                <div className="rounded-xl border border-cyan-500/20 bg-black/20 p-4 overflow-x-auto">
                  <h3 className="text-cyan-200 font-semibold mb-2">
                    {language === 'ar' ? 'معاينة (أول 5 صفوف)' : 'Preview (first 5 rows)'}
                  </h3>
                  <table className="w-full text-xs text-slate-300 border-collapse">
                    <thead>
                      <tr className="border-b border-cyan-500/20">
                        {Object.keys(analyze.previewRows[0] || {}).map((k) => (
                          <th key={k} className="text-left p-2">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analyze.previewRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-cyan-500/10">
                          {Object.values(row || {}).map((v, j) => (
                            <td key={j} className="p-2 max-w-[120px] truncate">{String(v ?? '—')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-cyan-500/30 text-cyan-200 text-sm disabled:opacity-50"
                >
                  {language === 'ar' ? 'رفع ملف آخر' : 'Upload another file'}
                </button>
                {!analyze.strictMatch && (analyze.detectedHeaders?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep('mapping')}
                    className="px-4 py-2 rounded-lg border border-slate-500 text-slate-300 text-sm"
                  >
                    {language === 'ar' ? 'تعديل الربط' : 'Edit mapping'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runImport(columnMapping)}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {loading ? (language === 'ar' ? 'جاري الاستيراد...' : 'Importing...') : (language === 'ar' ? 'استيراد' : 'Import')}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">
                <h3 className="font-semibold mb-2">{language === 'ar' ? 'تم الاستيراد' : 'Import complete'}</h3>
                <p className="mb-1">
                  {importResult.messageAr ?? (language === 'ar' ? `تم استيراد ${importResult.inserted ?? 0} صنف` : `Imported: ${importResult.inserted ?? 0}`)}
                </p>
                {(importResult.failedCount ?? 0) > 0 && (
                  <p className="text-amber-200">
                    {language === 'ar' ? 'تعذر استيراد:' : 'Failed:'} {importResult.failedCount}
                  </p>
                )}
              </div>
              {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
                <div className="text-yellow-200 text-sm">
                  {importResult.warnings.slice(0, 10).map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 flex-wrap">
                {(importResult.failedCount ?? 0) > 0 && importResult.batchId && (
                  <Link
                    href={`/inventory/import-fixes/${importResult.batchId}`}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium"
                  >
                    {language === 'ar' ? 'فتح شاشة التصحيح' : 'Open Fix Screen'}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm"
                >
                  {language === 'ar' ? 'استيراد ملف آخر' : 'Import another file'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
