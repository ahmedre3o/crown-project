# Backend restart instructions

To apply code changes, **stop** the current backend (Ctrl+C) and restart:

## Windows (PowerShell or CMD)

From **project root** (Crown-Project):
```
cd backend && npx ts-node api.ts
```

Or from **backend folder**:
```
npx ts-node api.ts
```

## Using npm scripts (from project root)

```
npm run backend
```

Or auto-restart on file changes:
```
npm run backend:dev
```

## Verify bulk delete and undo import

1. Restart backend with one of the commands above
2. **Bulk delete**: Open inventory, select products, click "حذف المحدد" → POST /api/products/bulk-delete returns 200
3. **Undo last import**: Click "التراجع عن آخر استيراد" → GET /api/products/import/last → confirm → POST /api/products/import/rollback returns 200
4. Products from last import are soft-deleted; inventory updates immediately
