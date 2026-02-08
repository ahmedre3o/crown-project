# Developer Notes: Online Orders & Invoice Integration

## Summary of Changes

### 1. Database (backend/db.ts)

**New Tables:**
- `online_orders` – id, shop_id, status, customer_name, phone, governorate, city, address, notes, payment_method, subtotal, total, currency (EGP), source (online), created_at
- `online_order_items` – id, order_id, product_id, name_snapshot, sku_snapshot, barcode_snapshot, sell_price_snapshot, quantity

**Sales Table Extensions:**
- `source` – VARCHAR(16) DEFAULT 'pos' (pos | online)
- `online_order_id` – INT NULL (FK to online_orders)
- `last_printed_at` – TIMESTAMP NULL
- `invoice_serial` – VARCHAR(64) NULL (e.g. ON-2026-000012 for online invoices)

### 2. Backend APIs (backend/api.ts)

**Storefront:**
- `POST /api/storefront/orders` – accepts shopId or domain; creates online_orders + online_order_items + notification

**Admin Orders:**
- `GET /api/admin/orders?status=` – list online_orders
- `GET /api/admin/orders/:id` – order details + items
- `PATCH /api/admin/orders/:id/status` – on **confirmed**: creates sale/invoice, deducts stock; on **completed**: requires invoice exists

**Notifications:**
- `GET /api/notifications/unread-count`
- `GET /api/notifications?limit=20`
- `PATCH /api/notifications/:id/read`

**Invoices/Sales:**
- `GET /api/sales?source=pos|online|all&search=` – filter by source, search by invoice_number, invoice_serial, customer_name, phone
- `GET /api/invoices?source=pos|online|all&search=` – same
- `POST /api/sales/:id/print` – increments print_count, sets last_printed_at

### 3. Frontend

**Storefront (app/storefront/page.tsx):**
- Dynamic title: "Store {shopName} — synced with inventory"
- Dynamic tagline: getTagline(businessType, lang) – auto_parts, pharmacy, grocery, default
- CROWN SERVICES widget: right side, fixed, responsive, safe margins
- Product images: imageUrl or placeholder
- Cart + "Order Now" → Checkout modal (customerName, phone, governorate, city, address, notes, paymentMethod)
- Checkout submits to POST /api/storefront/orders

**Admin Orders (app/store-admin/orders/page.tsx):**
- List online orders with filters (all/pending/confirmed/completed/cancelled)
- Expand row → details (items, address, notes)
- Confirm → creates invoice + deducts stock
- Complete / Cancel

**Invoices (app/invoices/page.tsx):**
- Tabs: All | POS | Online
- Search: invoice_serial, phone, customer_name
- Labels: "Online" vs "POS" badge per invoice
- "Printed #N" and last printed time
- Reprint warning toast when already printed

**NotificationsBell (app/components/NotificationsBell.tsx):**
- Polls /api/notifications/unread-count every 10s
- Badge with unread count
- Dropdown with notifications
- Toast on new order
- Mark as read on click

---

## How to Test

1. **Start services:**
   ```bash
   npm run dev:all
   ```

2. **Create 2 products** (Inventory page):
   - Add products with names, sell_price, stock_quantity

3. **Place online order:**
   - Go to `http://localhost:3000/storefront?preview=1-shop` (or your shop slug)
   - Add 2 products to cart
   - Click "اطلب الآن" / "Order Now"
   - Fill checkout form (name, phone, governorate, city, address)
   - Submit

4. **Verify notification:**
   - Log in as shop_owner/super_admin
   - Bell icon should show unread count
   - Toast "طلب أونلاين جديد!" / "New online order!"

5. **Confirm order:**
   - Go to "طلبات الأونلاين" / "Online Orders"
   - Expand order, click "تأكيد" / "Confirm"
   - Verify: order status → confirmed, invoice created

6. **Check invoices:**
   - Go to "الفواتير" / "Invoices"
   - Filter by "Online" tab
   - Invoice should appear with ON-2026-000001 serial
   - Expand and click "طباعة" / "Print"
   - Verify print count increments
   - Reprint → warning toast appears

7. **Complete order:**
   - Back to Online Orders
   - Click "مكتمل" / "Complete"

---

## Acceptance Criteria Checklist

- [x] Storefront shows inventory images via imageUrl; placeholders for missing
- [x] Store title and tagline dynamic (shopName, businessType); AR/EN
- [x] Floating widget on right, fixed, responsive, never blocks cards/buttons
- [x] Cart → Order Now → fill form → order saved in DB
- [x] Notification appears in dashboard (badge + toast) after order
- [x] Admin Online Orders page: list, details, status updates
- [x] On confirm/complete → invoice created (source=online)
- [x] Printing tracks printedCount + lastPrintedAt; warns on reprint
- [x] Online invoices separable from POS (filters/tabs)
- [x] Test with 2 products + 1 online order end-to-end
