import { pgTable, serial, text, varchar, integer, real, timestamp, pgEnum } from 'drizzle-orm/pg-core';

/**
 * نظام الصلاحيات (RBAC - Role-Based Access Control)
 * Bronze: صلاحيات محدودة (مثل موظف المبيعات)
 * Silver: صلاحيات متوسطة (مثل مدير المخزن)
 * Gold: صلاحيات كاملة (الأدمن)
 */
export const roleEnum = pgEnum('role', ['bronze', 'silver', 'gold']);

/**
 * جدول المستخدمين (Users)
 * لتخزين معلومات الدخول والصلاحيات.
 * ملاحظة: يجب عمل Hash لكلمة المرور في تطبيق حقيقي.
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 256 }).unique().notNull(),
  password_hash: text('password_hash').notNull(), // In a real app, this should be hashed
  role: roleEnum('role').default('bronze').notNull(),
});

/**
 * جدول قطع الغيار (Inventory/Parts)
 * لتخزين تفاصيل كل قطعة غيار في المخزن.
 */
export const parts = pgTable('parts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  brand: varchar('brand', { length: 256 }),
  buyPrice: real('buy_price').notNull(),
  sellPrice: real('sell_price').notNull(),
  stockQuantity: integer('stock_quantity').default(0).notNull(),
});

/**
 * جدول المبيعات (Sales)
 * لتسجيل كل عملية بيع تتم في النظام.
 */
export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  partId: integer('part_id').references(() => parts.id).notNull(),
  quantity: integer('quantity').notNull(),
  totalPrice: real('total_price').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});