# Frontend (crown-web) - Deploy إلى Cloud Run

## المتطلبات
- Backend (crown-api) مُنشّر ومُشغّل
- رابط الـ API: `https://crown-api-756273570281.us-central1.run.app`

## أوامر Deploy (PowerShell)

### 1) Build + Push الصورة
```powershell
gcloud builds submit . --config=cloudbuild-web.yaml --project=gen-lang-client-0711622878
```

### 2) Deploy على Cloud Run
```powershell
gcloud run deploy crown-web --image=us-central1-docker.pkg.dev/gen-lang-client-0711622878/cloud-run-source-deploy/crown-web:latest --region=us-central1 --platform=managed --allow-unauthenticated --set-env-vars=NEXT_PUBLIC_API_BASE_URL=https://crown-api-756273570281.us-central1.run.app --project=gen-lang-client-0711622878
```

> **ملاحظة:** `NEXT_PUBLIC_API_BASE_URL` يُمرّر كـ build-arg أثناء البناء (مُضمّن في الصورة). الـ env var أعلاه احتياطي لو احتجت override لاحقاً.

### 3) تحديث CORS في الـ Backend
بعد معرفة رابط crown-web، أضف الـ Origin في متغيرات crown-api:
```powershell
gcloud run services update crown-api --region=us-central1 --set-env-vars=CORS_ORIGIN=https://crown-web-XXXX.us-central1.run.app,http://localhost:3000 --project=gen-lang-client-0711622878
```
(استبدل `XXXX` بالـ ID الفعلي لخدمة crown-web)

---

## اختبار سريع بعد Deploy

1. **افتح الصفحة الرئيسية:**
   ```
   https://crown-web-XXXX.us-central1.run.app/
   ```

2. **اختبر استدعاء /api/health:**
   - افتح DevTools (F12) → Console
   - نفّذ:
   ```javascript
   fetch('https://crown-api-756273570281.us-central1.run.app/api/health').then(r=>r.json()).then(console.log)
   ```
   - النتيجة المتوقعة: `{status: "ok"}`
