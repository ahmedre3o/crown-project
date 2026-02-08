// رابط الاتصال بالباك إند - استخدم apiUrl() لجميع استدعاءات الـ API
export { API_BASE, API_BASE_URL, apiUrl } from '../lib/apiBase';

// تعريف الباقات والصلاحيات
export const PACKAGES = {
  BRONZE: { id: 'bronze', name: 'الباقة البرونزية', maxUsers: 1 },
  SILVER: { id: 'silver', name: 'الباقة الفضية', maxUsers: 3 },
  GOLD: { id: 'gold', name: 'الباقة الذهبية', maxUsers: 999 },
};
