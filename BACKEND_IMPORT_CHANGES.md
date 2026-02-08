# Backend Excel/CSV Import – Manual Edits for `backend/api.ts`

Apply these edits so the import is Power Query–like and does not restrict by field name.

---

## 1) Accept any file field; support xlsx/xlsm/csv only

**Find (around line 2810):**
```ts
    const allowedFileFields = ['file', 'excel', 'upload'];
    busboy.on('file', async (fieldName: string, file: NodeJS.ReadableStream, info: any) => {
      const name = (fieldName || '').toLowerCase();
      if (!allowedFileFields.includes(name)) {
        file.resume();
        return;
      }
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      const filename = info.filename || '';
      const lower = filename.toLowerCase();

      const setHeaderRowAndMap
```

**Replace with:**
```ts
    busboy.on('file', async (_fieldName: string, file: NodeJS.ReadableStream, info: any) => {
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      const filename = info.filename || '';
      const lower = filename.toLowerCase();
      const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
      const isCsv = ext === '.csv';
      const isExcel = ext === '.xlsx' || ext === '.xlsm';
      if (!isCsv && !isExcel) {
        analyzeError = 'Unsupported file type. Use .xlsx, .xlsm, or .csv';
        file.resume();
        await finish();
        return;
      }

      const setHeaderRowAndMap
```

---

## 2) Header row = first row with at least 2 non-empty cells (CSV)

**Find (CSV branch):**
```ts
          const rowHasNonEmpty = (row: Record<string, string>) =>
            Object.values(row).some((v) => String(v ?? '').trim() !== '');
          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (rowHasNonEmpty(rows[i])) {
              headerRowIndex = i;
              break;
            }
          }
```

**Replace with:**
```ts
          const nonEmptyCount = (row: Record<string, string>) =>
            Object.values(row).filter((v) => String(v ?? '').trim() !== '').length;
          const rowHasNonEmpty = (row: Record<string, string>) => nonEmptyCount(row) > 0;
          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (nonEmptyCount(rows[i]) >= 2) {
              headerRowIndex = i;
              break;
            }
          }
```

---

## 3) Header row = first row with at least 2 non-empty cells (Excel)

**Find (Excel branch):**
```ts
        const rowHasNonEmptyArr = (arr: string[]) => arr.some((c) => c !== '');
        let headerRowIndex = -1;
        for (let i = 0; i < excelRows.length; i++) {
          if (rowHasNonEmptyArr(excelRows[i])) {
            headerRowIndex = i;
            break;
          }
        }
```

**Replace with:**
```ts
        const nonEmptyCountArr = (arr: string[]) => arr.filter((c) => String(c).trim() !== '').length;
        const rowHasNonEmptyArr = (arr: string[]) => nonEmptyCountArr(arr) > 0;
        let headerRowIndex = -1;
        for (let i = 0; i < excelRows.length; i++) {
          if (nonEmptyCountArr(excelRows[i]) >= 2) {
            headerRowIndex = i;
            break;
          }
        }
```

---

## 4) Clear error messages

- **No header:** keep `analyzeError = 'No header row detected'` (already present).
- **No data rows:** keep `analyzeError = 'Excel file has no data rows'` (already present).
- **No worksheets:** keep `analyzeError = 'Excel file has no worksheets'` (already present).
- **Unsupported type:** added in step 1.

Optional: wrap Excel/CSV parsing in try/catch and set `analyzeError = err?.message || 'Unreadable file'` then `await finish()`.

---

## 5) Add logging

Right after `headers = ...` and `dataRows = ...` are set (in both CSV and Excel branches), add:
```ts
          console.log('[import] fileType=%s totalRows=%d', ext, dataRows.length);
```
(Use the same `ext` / `dataRows` variable names as in that branch.)

And in the Excel branch after `const dataRows = ...`:
```ts
        console.log('[import] fileType=xlsx totalRows=%d', dataRows.length);
```

---

## 6) Add route for frontend (optional)

If the frontend uses `/products/import-file`, add this after the existing `app.post('/api/products/import', ...)` block:

```ts
app.post(
  '/api/products/import-file',
  authenticateToken,
  requirePackageFeature('excel'),
  requireRole('super_admin', 'shop_owner', 'warehouse'),
  (req: any, res: Response) => handleProductsImportUpload(req, res)
);
```

**Note:** The current frontend was changed to use `/products/import`, so this route is only needed if you want to keep using `/products/import-file`.

---

## 7) Add sampleRows to analyze response (optional)

In the `finish` function, where you build the analyze response (`if (mode === 'analyze')`), ensure you have access to the first 10 data rows. If you have a `sampleDataRows` array (first 10 row objects), add to the returned object:
```ts
sampleRows: sampleDataRows,
```
You can fill `sampleDataRows` while iterating data rows (e.g. push to array until length >= 10) in both CSV and Excel branches.

---

## Summary

- **Required:** 1 (accept any file, restrict by extension), 2 (CSV header ≥2 cells), 3 (Excel header ≥2 cells).
- **Recommended:** 5 (logging), 6 only if you use `/import-file`.
- **Optional:** 4 (extra error wording), 7 (sampleRows).

After editing, run the backend and test with a .xlsx or .csv that has a header row and at least one data row.
