# Excel Import & Inventory Deletion — DONE

**Status:** Implemented and finalized. Do not modify unless business rules change.

## Inventory Safety Layer (Finalized)

- ✅ Bulk delete confirmation modal
- ✅ Rollback last import confirmation modal
- ✅ Server-side validation: bulk delete only affects products belonging to current shopId
- ✅ Arabic error handling for empty selection ("لم يتم تحديد أي صنف")
- ✅ Delete buttons disabled while request is pending
- ✅ Bulk delete logging: `console.log('BULK DELETE', { userId, shopId, count, timestamp })`
- ✅ Success toast with deleted count
- ✅ Inventory list refresh after delete/rollback

## Excel Import Features

- Modes 0–3: Strict, Template, Manual mapping, Auto mapping
- Partial import with staging
- Warehouse fix screen `/inventory/import-fixes/:batchId`
- Arabic notifications

## Rollback / Undo Last Import

- `GET /api/products/import/last`
- `POST /api/products/import/rollback` with `{ confirm: true }`
- `rolled_back_at` on import_batches
