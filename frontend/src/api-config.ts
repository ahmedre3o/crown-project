// رابط الاتصال بالباك إند اللي شغال على بورت 5001
export const API_BASE_URL = 'http://localhost:5001/api';

// تعريف الباقات والصلاحيات
export const PACKAGES = {
  BRONZE: { id: 'bronze', name: 'الباقة البرونزية', maxUsers: 1 },
  SILVER: { id: 'silver', name: 'الباقة الفضية', maxUsers: 3 },
  GOLD: { id: 'gold', name: 'الباقة الذهبية', maxUsers: 999 }
};
