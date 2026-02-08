# Excel/CSV Import Redo – Summary and Testing

## Files changed

| File | Change |
|------|--------|
| **app/excel-import/page.tsx** | Use `/products/import` (not import-file); show backend error/analyzeError instead of generic "Analyze failed"; accept 200 with `ok: false` and throw with message; accept `.xlsm`; dispatch `products-imported` after successful import. |
| **app/inventory/page.tsx** | Listen for `products-imported` and call `loadProducts()` so list refreshes after import. |
| **backend/api-patched.ts** | **New file** – `backend/api.ts` with Power Query–like import applied. **You must replace api.ts with this file** (see below). |
| **backend/apply-import-patch.js** | Script that generates api-patched.ts from api.ts. |
| **BACKEND_IMPORT_CHANGES.md** | Manual edit instructions if you prefer not to replace the file. |
| **backend/excel-import-handler.patch.txt** | Notes for the handler (reference). |

## Backend changes (in api-patched.ts)

1. **Accept any file field** – No restriction on multipart field name (`file`, `excel`, `upload`, or any other). First file is processed; extra files are drained and ignored.
2. **Supported types** – Only `.xlsx`, `.xlsm`, `.csv`. Anything else returns: `Unsupported file type. Use .xlsx, .xlsm, or .csv`.
3. **Header row** – First row with **at least 2 non-empty cells** (Power Query–like). Fully empty rows at the top are skipped.
4. **Clear errors** – No header → "No header row detected"; no data rows → "Excel file has no data rows"; no worksheets → "Excel file has no worksheets"; unsupported type → message above.

## How to apply backend patch

**Option A (recommended)**  
1. Close `backend/api.ts` in your editor.  
2. Replace it with the patched version:
   - Windows: `copy backend\api-patched.ts backend\api.ts`
   - Or in Explorer: delete or rename `api.ts`, then rename `api-patched.ts` to `api.ts`.
3. Reopen `backend/api.ts`.

**Option B**  
1. Close `backend/api.ts`.  
2. Run: `cd backend && node apply-import-patch.js` (script writes to api-patched.ts).  
3. Copy `api-patched.ts` over `api.ts` as in Option A.

**Option C**  
Apply the edits by hand using **BACKEND_IMPORT_CHANGES.md**.

## Frontend endpoint

The Excel import page now calls **`/api/products/import`** with `?mode=analyze` and `?mode=import`. The existing backend route is used; no new route was added.

## Run and test

1. **Start backend**  
   `cd backend && npm run dev` (or your start command; e.g. port 5001).

2. **Start frontend**  
   `npm run dev` (e.g. port 3000).

3. **Test analyze**  
   - Open the Excel import page.  
   - Upload a `.xlsx` or `.csv` with a header row (e.g. row 1: Part_Name, SellPrice, …) and at least one data row.  
   - You should get: detected headers, totalRows > 0, mapping step.  
   - If the file is invalid, you should see a specific message (e.g. "Excel file has no data rows", "Unsupported file type", "No header row detected") instead of "Analyze failed".

4. **Test import**  
   - Map columns and run import.  
   - Check that the report shows inserted count and any skipped rows.  
   - Open the Inventory page: the list should include the new products (or refresh after the `products-imported` event).

5. **Sample files**  
   - **CSV:** Header row with 2+ columns, e.g. `Part_Name,SellPrice,Stock` and one data row.  
   - **Excel:** Same in the first sheet, first row = header, next row(s) = data.

## Optional backend additions (see BACKEND_IMPORT_CHANGES.md)

- **Logging** – e.g. `console.log('[import] fileType=%s totalRows=%d', ext, dataRows.length)` in CSV and Excel branches.  
- **sampleRows** – Add first 10 data rows to the analyze response.  
- **Route** – If you want to keep using `/products/import-file`, add the extra route described in BACKEND_IMPORT_CHANGES.md.

## Cleanup

- **Reverted** – Restriction to field names `file` / `excel` / `upload` only; any file part is accepted and the first one is processed.  
- **Not changed** – Auth, inventory list endpoint, limits, pricing, or other routes. Only the import upload handler and the two frontend pages above were modified.
