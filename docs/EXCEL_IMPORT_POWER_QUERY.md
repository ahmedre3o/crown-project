# Excel/CSV Import (Power Query–style)

## الوصف
استيراد منتجات من ملف Excel أو CSV **بدون اختيار أعمدة يدوي**. النظام يكتشف الهيدر تلقائياً ويطابق الأعمدة إلى حقول المنتج (partName, sellPrice, buyPrice, …). أي عمود غير معروف يُتجاهل، وأي حقل مطلوب غير موجود في الملف يُعامل كـ `NULL`.

## تشغيل المشروع

```bash
# الباك إند (مثلاً من المجلد الرئيسي)
cd backend && npm run dev

# الفرونت إند
npm run dev
```

- الباك إند: عادةً `http://localhost:5001`
- الفرونت إند: عادةً `http://localhost:3000`

## الاختبار

1. افتح صفحة الاستيراد: `/excel-import`.
2. اختر ملفاً (xlsx / xlsm / csv).
3. اضغط **تحليل (Analyze)**:
   - يظهر عدد الصفوف، الأعمدة المكتشفة، والمطابقة التلقائية (inferredMap).
   - معاينة أول 5 صفوف إن وُجدت.
4. اضغط **استيراد (Import)**:
   - يتم الإدخال مباشرة بدون خطوة mapping.
   - النتيجة: عدد المُدخَل، عدد المُتخطَّى، وتحذيرات إن وُجدت.
5. صفحة المخزون (Inventory) تُحدَّث تلقائياً بعد الاستيراد (حدث `products-imported`).

## مثال ملف Excel/CSV

أسماء أعمدة مقبولة (بأي ترتيب، عربي أو إنجليزي). أول صف يجب أن يحتوي على **على الأقل عمودين غير فاضيين** ليعتبر هيدر.

| Part_Name   | Name_AR   | Brand  | Category | SellPrice | BuyPrice | Stock | SKU | Barcode | QR_Code | Image_URL |
|-------------|-----------|--------|----------|-----------|----------|-------|-----|---------|---------|-----------|
| منتج 1      | اسم عربي  | ماركة  | فئة      | 100       | 50       | 10    | A1  | 123     |         | https://… |

- **Part_Name** أو **part name** أو **اسم المنتج** → اسم المنتج.
- **Name_AR** أو **اسم عربي** → الاسم بالعربي.
- **Brand**, **Category**, **SellPrice**, **BuyPrice**, **Stock**, **SKU**, **Barcode**, **QR_Code**, **Image_URL** لها مرادفات مدعومة (انظر الـ aliases في الكود).

يمكنك استخدام نفس الأسماء كما في الجدول أعلاه أو مرادفاتها (مثل `sell_price`, `سعر البيع`, `price` لسعر البيع).

## Endpoints

- `POST /api/products/import?mode=analyze`  
  رفع ملف، يرجع: `detectedHeaders`, `normalizedHeaders`, `inferredMap`, `totalRowsDetected`, `previewRows`, `warnings`, `error` إن فشل.

- `POST /api/products/import?mode=import`  
  رفع نفس الملف (أو ملف بنفس الشكل)، ينفّذ الاستيراد ويرجع: `inserted`, `updated`, `skippedCount`, `skipped`, `warnings`.

## الملفات المعدّلة

- **backend/api.ts**: تحليل الملف (Power Query–style)، تطبيع الهيدر، جدول aliases + fuzzy matching، `parseExcelOrCsv`, `inferColumnMapping`, `toCanonicalRow`, `canonicalRowToDbInsert`، ومعالجة multipart (أي اسم field للملف، أول ملف فقط).
- **app/excel-import/page.tsx**: واجهة مبسطة (رفع → تحليل → ملخص → استيراد)، بدون UI لاختيار الأعمدة.
- **app/inventory/page.tsx**: استماع لحدث `products-imported` وإعادة تحميل القائمة.
