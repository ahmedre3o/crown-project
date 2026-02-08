import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  direction: 'ltr' | 'rtl';
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.inventory': 'Inventory',
    'nav.sales': 'Sales',
    'nav.pos': 'Point of Sale',
    'nav.staff': 'Staff',
    'nav.reports': 'Reports',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.monthlyRevenue': 'Monthly Revenue',
    'dashboard.activeParts': 'Active Parts',
    'dashboard.staffOnline': 'Staff Online',
    'dashboard.lowStockAlerts': 'Low Stock Alerts',
    'dashboard.salesChart': 'Sales Analytics',
    'dashboard.profitChart': 'Profit Analytics',
    'dashboard.recentStock': 'Recent Stock Update',
    
    // POS
    'pos.title': 'Point of Sale',
    'pos.categories': 'Categories',
    'pos.products': 'Products',
    'pos.cart': 'Cart',
    'pos.total': 'Total',
    'pos.cash': 'Cash',
    'pos.card': 'Card',
    'pos.printReceipt': 'Print Receipt',
    'pos.clear': 'Clear',
    'pos.addToCart': 'Add to Cart',
    'pos.quantity': 'Quantity',
    'pos.price': 'Price',
    
    // Inventory
    'inventory.title': 'Inventory Management',
    'inventory.addProduct': 'Add Product',
    'inventory.productName': 'Product Name',
    'inventory.brand': 'Brand',
    'inventory.category': 'Category',
    'inventory.buyPrice': 'Buy Price',
    'inventory.sellPrice': 'Sell Price',
    'inventory.stock': 'Stock',
    'inventory.minStock': 'Min Stock Level',
    
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
  },
  ar: {
    // Navigation
    'nav.dashboard': 'لوحة التحكم',
    'nav.inventory': 'المخزون',
    'nav.sales': 'المبيعات',
    'nav.pos': 'نقطة البيع',
    'nav.staff': 'الموظفين',
    'nav.reports': 'التقارير',
    'nav.settings': 'الإعدادات',
    'nav.logout': 'تسجيل الخروج',
    
    // Dashboard
    'dashboard.title': 'لوحة التحكم',
    'dashboard.monthlyRevenue': 'الإيرادات الشهرية',
    'dashboard.activeParts': 'القطع النشطة',
    'dashboard.staffOnline': 'الموظفين المتصلين',
    'dashboard.lowStockAlerts': 'تنبيهات النقص',
    'dashboard.salesChart': 'تحليلات المبيعات',
    'dashboard.profitChart': 'تحليلات الأرباح',
    'dashboard.recentStock': 'آخر تحديثات المخزون',
    
    // POS
    'pos.title': 'نقطة البيع',
    'pos.categories': 'الفئات',
    'pos.products': 'المنتجات',
    'pos.cart': 'السلة',
    'pos.total': 'الإجمالي',
    'pos.cash': 'نقدي',
    'pos.card': 'بطاقة',
    'pos.printReceipt': 'طباعة الفاتورة',
    'pos.clear': 'مسح',
    'pos.addToCart': 'إضافة للسلة',
    'pos.quantity': 'الكمية',
    'pos.price': 'السعر',
    
    // Inventory
    'inventory.title': 'إدارة المخزون',
    'inventory.addProduct': 'إضافة منتج',
    'inventory.productName': 'اسم المنتج',
    'inventory.brand': 'العلامة التجارية',
    'inventory.category': 'الفئة',
    'inventory.buyPrice': 'سعر الشراء',
    'inventory.sellPrice': 'سعر البيع',
    'inventory.stock': 'المخزون',
    'inventory.minStock': 'الحد الأدنى للمخزون',
    
    // Common
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.search': 'بحث',
    'common.loading': 'جاري التحميل...',
    'common.error': 'خطأ',
    'common.success': 'نجح',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language;
    return saved || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const direction = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, direction }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
