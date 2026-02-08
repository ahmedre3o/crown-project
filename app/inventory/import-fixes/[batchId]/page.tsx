'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '../../../components/Sidebar';
import { useLanguage } from '../../../contexts/LanguageContext';
import { apiUrl } from '../../../api-config';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

type BatchRow = {
  id: number;
  rowIndex: number;
  rawData: Record<string, string>;
  mappedData: Record<string, string | null>;
  errors: string[];
  status: string;
};

type BatchInfo = {
  id: number;
  fileName: string;
  status: string;
  importedCount: number;
  failedCount: number;
  createdAt: string;
};

const CANONICAL_FIELDS = [
  { key: 'partName', apiKey: 'name', labelAr: 'الاسم', labelEn: 'Name' },
  { key: 'nameAr', apiKey: 'nameAr', labelAr: 'الاسم عربي', labelEn: 'Name (AR)' },
  { key: 'brand', apiKey: 'brand', labelAr: 'العلامة', labelEn: 'Brand' },
  { key: 'category', apiKey: 'category', labelAr: 'التصنيف', labelEn: 'Category' },
  { key: 'sellPrice', apiKey: 'sellPrice', labelAr: 'سعر البيع', labelEn: 'Sell Price' },
  { key: 'buyPrice', apiKey: 'buyPrice', labelAr: 'سعر الشراء', labelEn: 'Buy Price' },
  { key: 'stockQty', apiKey: 'stockQuantity', labelAr: 'الكمية', labelEn: 'Stock' },
  { key: 'sku', apiKey: 'sku', labelAr: 'SKU', labelEn: 'SKU' },
  { key: 'barcode', apiKey: 'barcode', labelAr: 'الباركود', labelEn: 'Barcode' },
  { key: 'qrCode', apiKey: 'qrCode', labelAr: 'QR', labelEn: 'QR Code' },
  { key: 'imageUrl', apiKey: 'imageUrl', labelAr: 'الصورة', labelEn: 'Image URL' },
];

function buildHeaders(): Record<string, string> {
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
}

export default function ImportFixesPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params?.batchId as string;
  const { t, direction, language } = useLanguage();
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Record<string, string>>>({});
  const [committing, setCommitting] = useState<string | null>(null);
  const [commitAllLoading, setCommitAllLoading] = useState(false);

  useEffect(() => {
    if (!batchId) return;
    loadBatch();
  }, [batchId]);

  const loadBatch = async () => {
    if (!batchId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(apiUrl(`/products/import/batch/${batchId}`), { headers: buildHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!data.ok || !res.ok) {
        setError(data.error || 'Failed to load batch');
        return;
      }
      setBatch(data.batch);
      setRows(data.rows || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const updateRowField = (rowIndex: number, field: string, value: string) => {
    setEditing((prev) => ({
      ...prev,
      [String(rowIndex)]: {
        ...(prev[String(rowIndex)] || {}),
        [field]: value,
      },
    }));
  };

  const getDisplayValue = (row: BatchRow, field: { key: string; apiKey: string }) => {
    const editVal = editing[String(row.rowIndex)]?.[field.apiKey];
    if (editVal !== undefined) return editVal;
    const raw = row.mappedData?.[field.key] ?? row.mappedData?.[field.apiKey];
    return raw ?? '';
  };

  const patchRow = async (rowIndex: number) => {
    const row = rows.find((r) => r.rowIndex === rowIndex);
    if (!row) return;
    const edits = editing[String(rowIndex)];
    if (!edits || Object.keys(edits).length === 0) return;
    setCommitting(String(rowIndex));
    try {
      const res = await fetch(
        apiUrl(`/products/import/batch/${batchId}/row/${rowIndex}`),
        {
          method: 'PATCH',
          headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(edits),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setEditing((prev) => {
          const next = { ...prev };
          delete next[String(rowIndex)];
          return next;
        });
        await loadBatch();
      } else {
        alert(data.error || 'Update failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Update failed');
    } finally {
      setCommitting(null);
    }
  };

  const commitAll = async () => {
    setCommitAllLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/products/import/batch/${batchId}/commit`),
        { method: 'POST', headers: buildHeaders() }
      );
      const data = await res.json();
      if (data.ok) {
        const msg = data.messageAr || (language === 'ar' ? `تم اعتماد ${data.committed ?? 0} صنف` : `${data.committed ?? 0} items committed`);
        alert(msg);
        await loadBatch();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('products-imported'));
      } else {
        alert(data.error || 'Commit failed');
      }
    } catch (e: any) {
      alert(e?.message || 'Commit failed');
    } finally {
      setCommitAllLoading(false);
    }
  };

  const invalidRows = rows.filter((r) => r.status === 'invalid' || r.status === 'pending');
  const canCommit = invalidRows.length > 0;

  return (
    <div className="min-h-screen bg-black text-white flex" dir={direction}>
      <Sidebar />
      <div className="flex-1 p-8 pt-20 md:pt-8 overflow-x-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/inventory"
            className="text-cyan-200 hover:text-cyan-100 text-sm"
          >
            ← {language === 'ar' ? 'المخزن' : 'Inventory'}
          </Link>
          <h1 className="text-2xl font-bold text-cyan-200">
            {language === 'ar' ? 'شاشة تصحيح الاستيراد' : 'Import Fix Screen'}
          </h1>
        </div>

        {loading && (
          <p className="text-slate-400">{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        )}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 mb-4">
            {error}
          </div>
        )}

        {!loading && batch && (
          <div className="space-y-6">
            <div className="rounded-xl border border-cyan-500/20 bg-black/20 p-4">
              <p className="text-slate-300">
                {language === 'ar' ? 'الملف:' : 'File:'} <strong>{batch.fileName}</strong>
              </p>
              <p className="text-slate-300">
                {language === 'ar' ? 'تم استيراد:' : 'Imported:'} <strong>{batch.importedCount}</strong>
              </p>
              <p className="text-slate-300">
                {language === 'ar' ? 'فشل:' : 'Failed:'} <strong>{batch.failedCount}</strong>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-cyan-500/30">
                    <th className="text-left p-2 text-cyan-200">#</th>
                    <th className="text-left p-2 text-cyan-200">
                      {language === 'ar' ? 'الأخطاء' : 'Errors'}
                    </th>
                    {CANONICAL_FIELDS.slice(0, 8).map((f) => (
                      <th key={f.key} className="text-left p-2 text-cyan-200 min-w-[100px]">
                        {language === 'ar' ? f.labelAr : f.labelEn}
                      </th>
                    ))}
                    <th className="text-left p-2 text-cyan-200">
                      {language === 'ar' ? 'إجراء' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                      <td className="p-2 text-slate-400">{row.rowIndex}</td>
                      <td className="p-2 max-w-[200px]">
                        <div className="text-red-300 text-xs space-y-1">
                          {(row.errors || []).map((e, i) => (
                            <div key={i}>{e}</div>
                          ))}
                        </div>
                      </td>
                      {CANONICAL_FIELDS.slice(0, 8).map((f) => (
                        <td key={f.key} className="p-2">
                          <input
                            type="text"
                            value={getDisplayValue(row, f)}
                            onChange={(e) => updateRowField(row.rowIndex, f.apiKey, e.target.value)}
                            className="w-full min-w-[80px] bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs"
                            placeholder={f.labelAr}
                          />
                        </td>
                      ))}
                      <td className="p-2">
                        <button
                          onClick={() => patchRow(row.rowIndex)}
                          disabled={
                            committing === String(row.rowIndex) ||
                            !editing[String(row.rowIndex)] ||
                            Object.keys(editing[String(row.rowIndex)] || {}).length === 0
                          }
                          className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs disabled:opacity-50"
                        >
                          {committing === String(row.rowIndex)
                            ? '...'
                            : language === 'ar'
                            ? 'اعتماد'
                            : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canCommit && (
              <div className="flex gap-4">
                <button
                  onClick={commitAll}
                  disabled={commitAllLoading}
                  className="px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium disabled:opacity-50"
                >
                  {commitAllLoading
                    ? (language === 'ar' ? 'جاري الاعتماد...' : 'Committing...')
                    : language === 'ar'
                    ? 'اعتماد الكل'
                    : 'Approve All'}
                </button>
              </div>
            )}

            {!canCommit && rows.length > 0 && (
              <p className="text-slate-400">
                {language === 'ar' ? 'لا توجد أصناف تحتاج تصحيح.' : 'No rows need fixing.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
