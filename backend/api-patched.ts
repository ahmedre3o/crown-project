import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { Readable } from 'stream';
import { pool, testConnection, initializeDatabase } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
import Busboy from 'busboy';
import ExcelJS from 'exceljs';
import csvParser from 'csv-parser';
import { GoogleGenAI } from '@google/genai';
import { domainToASCII } from 'url';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const localEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: localEnvPath });
dotenv.config({ path: rootEnvPath });

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Public APIs (storefront) must be accessible from any domain
app.use(
  '/api/public',
  cors({
    origin: true,
    credentials: false,
    allowedHeaders: ['Content-Type', 'x-forwarded-host', 'x-shop-domain'],
  })
);
// ERP (authenticated) APIs - lock down origins in production
app.use((req, res, next) => {
  if (req.path.startsWith('/api/public')) return next();
  return cors({ origin: 'http://localhost:3000', credentials: true })(req, res, next);
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// TEMPORARY: remove after setup
app.get('/api/setup-admin', async (_req: Request, res: Response) => {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.execute('SELECT id FROM users WHERE username = ?', ['admin@crown.com']);
      if ((existingUsers as any[]).length > 0) {
        await connection.rollback();
        return res.json({ message: 'Admin already exists' });
      }

      const [shopResult] = await connection.execute(
        'INSERT INTO shops (name, business_name, owner_name, activity_type, address, contact_email, contact_phone, owner_id, package) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['Crown Headquarters', 'Crown Headquarters', 'Crown Admin', 'Headquarters', null, 'admin@crown.com', null, 0, 'gold']
      );
      const shopInsert = shopResult as any;

      const hashedPassword = await bcrypt.hash('password123', 10);
      const [userResult] = await connection.execute(
        'INSERT INTO users (username, password, role, package, shop_id) VALUES (?, ?, ?, ?, ?)',
        ['admin@crown.com', hashedPassword, 'super_admin', 'gold', shopInsert.insertId]
      );
      const userInsert = userResult as any;

      await connection.execute('UPDATE shops SET owner_id = ? WHERE id = ?', [userInsert.insertId, shopInsert.insertId]);
      await connection.commit();

      return res.json({ message: 'Super admin created', shopId: shopInsert.insertId, userId: userInsert.insertId });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'crown-services-secret-key-2026';
const PORT = parseInt(process.env.PORT || '5001', 10);

console.log('AI API KEY:', GEMINI_API_KEY ? 'LOADED' : 'MISSING');
const genAI = (() => {
  if (!GEMINI_API_KEY) return null;
  try {
    // Use stable (v1) endpoints to avoid v1beta model issues.
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY, apiVersion: 'v1' });
  } catch (error) {
    console.error('❌ Gemini SDK init error:', error);
    return null;
  }
})();
// NOTE: Available models for the stable v1 endpoint can vary by API.
// We default to a fast model that is currently available in `models.list()`.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const DEFAULT_ADMIN_HASH = '$2a$10$CB6YvQC5O/sk9D2ZpgZYBuNGPMOn/2vAGylpa5edvWivtld0h1wQW';

const ensureSuperAdmin = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [userRows] = await connection.execute('SELECT * FROM users WHERE username = ?', ['admin@crown.com']);
    let adminUser = (userRows as any[])[0];

    if (!adminUser) {
      const [userResult] = await connection.execute(
        'INSERT INTO users (username, password, role, package, shop_id) VALUES (?, ?, ?, ?, ?)',
        ['admin@crown.com', DEFAULT_ADMIN_HASH, 'super_admin', 'gold', null]
      );
      const userInsert = userResult as any;
      adminUser = { id: userInsert.insertId };
    }

    const [shopRows] = await connection.execute('SELECT * FROM shops WHERE id = 1');
    if ((shopRows as any[]).length === 0) {
      await connection.execute(
        `INSERT INTO shops (id, name, business_name, owner_name, activity_type, address, contact_email, contact_phone, owner_id, package)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 'Crown Headquarters', 'Crown Headquarters', 'Crown Admin', 'Headquarters', null, 'admin@crown.com', null, adminUser.id, 'gold']
      );
    }

    await connection.execute('UPDATE users SET shop_id = ? WHERE username = ?', [1, 'admin@crown.com']);
    await connection.commit();
    console.log('✅ SUPER ADMIN READY');
  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to ensure super admin:', (error as any).message);
  } finally {
    connection.release();
  }
};

// Initialize database on startup
testConnection().then(async () => {
  try {
    await initializeDatabase();
    try {
      await pool.execute('ALTER TABLE shops MODIFY COLUMN logo_url LONGTEXT');
    } catch (migrationError) {
      console.error('❌ logo_url migration error:', (migrationError as any)?.message || migrationError);
    }
    await ensureSuperAdmin();
  } catch (error) {
    console.error(error);
  }
});

// Middleware for authentication
const authenticateToken = async (req: any, res: Response, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    const userArray = users as any[];
    
    if (userArray.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userArray[0];
    if (!user.shop_id && decoded.shopId) {
      user.shop_id = decoded.shopId;
    }

    if (user.shop_id) {
      const [shops] = await pool.execute('SELECT package FROM shops WHERE id = ?', [user.shop_id]);
      const shopArray = shops as any[];
      if (shopArray.length > 0) {
        user.package = shopArray[0].package;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const resolveShopId = (req: any) => {
  const headerShop = req.headers['x-shop-id'];
  const headerShopId = Array.isArray(headerShop) ? headerShop[0] : headerShop;
  const headerParsed = headerShopId ? Number(headerShopId) : null;
  if (req.user?.role === 'super_admin') {
    return req.query.shopId || req.body?.shopId || headerParsed || null;
  }
  return req.user?.shop_id || req.user?.shopId || headerParsed || null;
};

// ========== DOMAIN RESOLUTION + VERIFICATION ==========
const ALLOWED_DOMAIN_TLDS = new Set(['com', 'net', 'org', 'shop', 'store']);
const DOMAIN_VERIFY_RECORD_PREFIX = '_crown-verify';
const DOMAIN_VERIFY_CNAME_ROOT = process.env.DOMAIN_VERIFY_CNAME_ROOT || 'verify.crowncs.org';

const normalizeFqdn = (value: string) => String(value || '').trim().toLowerCase().replace(/\.+$/, '');

const normalizeHostHeader = (hostHeader: any) => {
  let host = String(hostHeader || '').trim();
  if (!host) return '';
  if (host.includes(',')) host = host.split(',')[0].trim();

  // IPv6: [::1]:3000
  if (host.startsWith('[')) {
    const idx = host.indexOf(']');
    if (idx !== -1) host = host.slice(1, idx);
  } else {
    host = host.split(':')[0];
  }

  return normalizeFqdn(host);
};

const normalizeDomainInput = (input: any) => {
  let raw = String(input || '').trim();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\//i, '');
  raw = raw.split('/')[0];
  raw = raw.split('?')[0];
  raw = raw.split('#')[0];
  raw = raw.split(':')[0];
  raw = normalizeFqdn(raw);
  const ascii = domainToASCII(raw);
  return normalizeFqdn(ascii || '');
};

const validateDomainOrThrow = (domain: string) => {
  if (!domain) throw new Error('domain is required');
  if (domain.length < 4 || domain.length > 253) throw new Error('invalid domain length');
  if (domain === 'localhost') throw new Error('invalid domain');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) throw new Error('ip domains are not allowed');

  const tld = domain.split('.').pop() || '';
  if (!ALLOWED_DOMAIN_TLDS.has(tld)) {
    throw new Error('invalid TLD');
  }

  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const re = new RegExp(`^(?:${label}\\.)+(${Array.from(ALLOWED_DOMAIN_TLDS).join('|')})$`, 'i');
  if (!re.test(domain)) throw new Error('invalid domain format');
};

const dnsNameForDomain = (domain: string) => `${DOMAIN_VERIFY_RECORD_PREFIX}.${domain}`;
const expectedTxtValue = (token: string) => `crown-site-verification=${token}`;
const expectedCnameTarget = (token: string) => normalizeFqdn(`${token}.${DOMAIN_VERIFY_CNAME_ROOT}`);

const verifyDomainByTxt = async (domain: string, token: string) => {
  const name = dnsNameForDomain(domain);
  const expected = expectedTxtValue(token);
  try {
    const records = await dns.resolveTxt(name);
    const flattened = records.flat().map((s) => String(s || '').trim());
    return flattened.some((v) => v === expected || v === token);
  } catch {
    return false;
  }
};

const verifyDomainByCname = async (domain: string, token: string) => {
  const name = dnsNameForDomain(domain);
  const expected = expectedCnameTarget(token);
  try {
    const cnames = await dns.resolveCname(name);
    return cnames.some((c) => normalizeFqdn(c) === expected);
  } catch {
    return false;
  }
};

const verifyDomainDns = async (domain: string, method: 'txt' | 'cname', token: string) => {
  if (method === 'cname') return verifyDomainByCname(domain, token);
  return verifyDomainByTxt(domain, token);
};

// Public resolver: map Host header -> shop_id (reject unknown or inactive domains)
const resolveShopByDomainHost = async (req: any, res: Response, next: any) => {
  const forwardedHost = req.headers?.['x-forwarded-host'] || req.headers?.['x-shop-domain'];
  const host = normalizeHostHeader(forwardedHost || req.headers?.host);
  if (!host) return res.status(400).json({ error: 'Host header required' });

  const candidateA = host;
  const candidateB = host.startsWith('www.') ? host.slice(4) : `www.${host}`;

  try {
    const [rows] = await pool.execute(
      `
      SELECT d.shop_id, d.domain, d.status, d.is_active, d.verified_at, s.package, s.is_active as shop_active
      FROM domains d
      JOIN shops s ON s.id = d.shop_id
      WHERE d.domain IN (?, ?)
      LIMIT 1
      `,
      [candidateA, candidateB]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Unknown domain' });

    const domainActive =
      Number(row.is_active) === 1 && row.status === 'active' && row.verified_at !== null;
    const shopActive = Number(row.shop_active) === 1;

    if (!domainActive || !shopActive) {
      return res.status(403).json({ error: 'Domain inactive or unverified' });
    }

    req.shopId = Number(row.shop_id);
    req.resolvedDomain = row.domain;
    req.shopPackage = row.package;
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: 'Domain resolution failed' });
  }
};

// Middleware for role-based access control
const requireRole = (...allowedRoles: string[]) => {
  return (req: any, res: Response, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// POST /api/products/bulk-delete
app.post('/api/products/bulk-delete', authenticateToken, requireRole('super_admin', 'shop_owner', 'warehouse'), async (req: any, res: Response) => {
  console.log('HIT /api/products/bulk-delete', req.body);
  try {
    const ids = (req.body?.ids ?? []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
    if (!ids.length) {
      return res.status(400).json({ ok: false, error: 'Invalid product id(s)' });
    }
    const shopId = req.user?.shopId ?? req.user?.shop_id ?? resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ ok: false, error: 'shopId is required' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE products SET is_deleted = 1 WHERE id IN (${placeholders}) AND shop_id = ?`,
      [...ids, shopId]
    );
    const deletedCount = (result as any).affectedRows ?? 0;
    return res.json({ ok: true, deletedCount });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Debug: list available Gemini models for this API key (super admin only)
app.get('/api/models', authenticateToken, requireRole('super_admin'), async (req: any, res: Response) => {
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(400).json({ error: 'AI API key is missing' });
    }

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

    const pager = await genAI.models.list();
    const models: any[] = [];
    for await (const model of pager) {
      const m = model as any;
      models.push({
        name: m?.name,
        displayName: m?.displayName,
        description: m?.description,
        inputTokenLimit: m?.inputTokenLimit,
        outputTokenLimit: m?.outputTokenLimit,
        supportedGenerationMethods: m?.supportedGenerationMethods,
      });
      if (models.length >= limit) break;
    }

    res.json({ count: models.length, models });
  } catch (error: any) {
    console.error('❌ /api/models error:', { name: error?.name, status: error?.status, message: error?.message });
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// Middleware for package-based access control
const requirePackageFeature = (feature: 'qr' | 'pos' | 'dashboard' | 'excel' | 'ai' | 'storefront') => {
  return (req: any, res: Response, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role === 'super_admin') {
      return next();
    }

    const plan = (req.user.package || 'bronze') as 'bronze' | 'silver' | 'gold';
    const config = tierFeatures[plan] || tierFeatures.bronze;

    const allowed =
      feature === 'pos'
        ? true
        : feature === 'dashboard'
        ? true
        : feature === 'excel'
        ? Boolean(config.excelImport)
        : feature === 'ai'
        ? Boolean(config.voiceAssistant)
        : feature === 'qr'
        ? Boolean(config.qrCode || config.barcode)
        : feature === 'storefront'
        ? plan === 'gold'
        : false;

    if (!allowed) {
      return res.status(403).json({ error: 'Plan does not allow this feature' });
    }

    return next();
  };
};

const tierFeatures = {
  bronze: {
    maxProducts: 500,
    barcode: false,
    qrCode: false,
    pharmacyExpiry: false,
    reports: false,
    voiceAssistant: false,
    excelImport: false,
  },
  silver: {
    maxProducts: null,
    barcode: true,
    qrCode: true,
    pharmacyExpiry: true,
    reports: true,
    voiceAssistant: false,
    excelImport: false,
  },
  gold: {
    maxProducts: null,
    barcode: true,
    qrCode: true,
    pharmacyExpiry: true,
    reports: true,
    voiceAssistant: true,
    excelImport: true,
  },
} as const;

const getShopTier = async (shopId: number) => {
  const [shops] = await pool.execute('SELECT package FROM shops WHERE id = ?', [shopId]);
  const shopArray = shops as any[];
  return (shopArray[0]?.package || 'bronze') as 'bronze' | 'silver' | 'gold';
};

const enforceProductLimit = async (shopId: number, incomingCount: number) => {
  const tier = await getShopTier(shopId);
  const config = tierFeatures[tier];
  if (config.maxProducts === null) return { allowed: true, remaining: null, tier };

  const [counts] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE shop_id = ?', [shopId]);
  const existingCount = Number((counts as any[])[0]?.count || 0);
  const totalAfter = existingCount + incomingCount;
  if (totalAfter > config.maxProducts) {
    const remaining = Math.max(0, config.maxProducts - existingCount);
    return { allowed: false, remaining, tier, maxProducts: config.maxProducts, existingCount };
  }
  return { allowed: true, remaining: config.maxProducts - existingCount, tier, maxProducts: config.maxProducts, existingCount };
};

const logAudit = async (params: {
  shopId: number;
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}) => {
  await pool.execute(
    `INSERT INTO audit_logs (shop_id, user_id, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.shopId,
      params.userId || null,
      params.action,
      params.entityType,
      params.entityId || null,
      params.details || null,
      params.ipAddress || null,
    ]
  );
};

const normalizeText = (value?: any) => {
  return String(value || '').trim().toLowerCase();
};

const detectUserLanguage = (text: string): 'ar' | 'en' => {
  const sample = String(text || '');
  // Arabic ranges: Arabic, Arabic Supplement, Arabic Extended-A/B
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(sample);
  return hasArabic ? 'ar' : 'en';
};

const getTtsLocaleForLang = (lang: 'ar' | 'en') => {
  return lang === 'ar' ? 'ar-EG' : 'en-US';
};

const normalizeNumber = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

const fieldMatchers: Record<string, string[]> = {
  name: [
    'name',
    'product',
    'productname',
    'item',
    'title',
    'part name',
    'part_name',
    'partname',
    'Part_Name',
    'description',
    'item name',
    'اسم المنتج',
    'المنتج',
    'اسم',
    'اسم الصنف',
    'الوصف',
  ],
  nameAr: ['name_ar', 'name ar', 'arabic', 'arabicname', 'اسم عربي', 'اسم'],
  brand: ['brand', 'Brand', 'manufacturer', 'company', 'mark', 'الماركة', 'العلامة'],
  sku: ['sku', 'itemcode', 'code', 'partnumber', 'part', 'reference', 'ref', 'رقم الصنف'],
  barcode: ['barcode', 'bar code', 'ean', 'upc', 'gtin', 'باركود', 'qr code', 'qr_code', 'qrcode', 'QR_Code'],
  qrCode: ['qr', 'qrcode', 'qr code'],
  category: ['category', 'group', 'type', 'قسم', 'الفئة', 'تصنيف'],
  buyPrice: [
    'buy',
    'buy price',
    'buyprice',
    'buy_price',
    'BuyPrice',
    'cost',
    'purchase',
    'purchaseprice',
    'costprice',
    'سعر الشراء',
    'شراء',
    'تكلفة',
    'سعر التكلفة',
  ],
  sellPrice: [
    'sell',
    'sell price',
    'sellprice',
    'saleprice',
    'selling price',
    'price',
    'unitprice',
    'سعر البيع',
    'بيع',
    'السعر',
    'سعر',
  ],
  stockQuantity: ['qty', 'quantity', 'stock', 'Stock', 'available', 'onhand', 'كمية', 'المخزون'],
  minStockLevel: ['min', 'minimum', 'reorder', 'minstock', 'min stock', 'حد ادنى', 'حد أدنى'],
  imageUrl: ['image url', 'image_url', 'imageurl', 'img', 'photo', 'picture', 'Image_URL'],
};

type ImportMappingValidation = {
  ok: boolean;
  missingFields: Array<'name' | 'sellPrice'>;
};

const validateProductImportMapping = (columnMap: Record<string, string>): ImportMappingValidation => {
  return { ok: true, missingFields: [] };
};

const buildProductImportMappingGuide = (headers: string[], columnMap: Record<string, string>, reason: string) => {
  return {
    ok: true,
    reason,
    missingFields: [] as Array<'name' | 'sellPrice'>,
    detectedHeaders: headers,
    currentMapping: columnMap,
    optionalFields: [
      { field: 'name', note: 'Product name (empty → draft name).', acceptedHeaders: fieldMatchers.name },
      { field: 'sellPrice', note: 'Sell price (empty → 0, row saved as draft).', acceptedHeaders: [...fieldMatchers.sellPrice, ...fieldMatchers.buyPrice] },
    ],
    suggestedHeaders: {
      name: fieldMatchers.name,
      nameAr: fieldMatchers.nameAr,
      sellPrice: fieldMatchers.sellPrice,
      buyPrice: fieldMatchers.buyPrice,
      stockQuantity: fieldMatchers.stockQuantity,
      sku: fieldMatchers.sku,
      barcode: fieldMatchers.barcode,
      qrCode: fieldMatchers.qrCode,
      brand: fieldMatchers.brand,
      category: fieldMatchers.category,
      minStockLevel: fieldMatchers.minStockLevel,
      imageUrl: fieldMatchers.imageUrl,
    },
    tip: 'Map columns for best results. Empty fields are imported as drafts.',
  };
};

const normalizeHeader = (value: string) => {
  const s = value.toString().trim().replace(/\s+/g, ' ');
  const lower = s.toLowerCase();
  return lower.replace(/[_\-]/g, ' ');
};

const normalizeHeaderForMatch = (value: string) => {
  const s = value.toString().trim().replace(/\s+/g, ' ');
  return s.replace(/[_\-]/g, ' ');
};

const isHeaderLike = (headers: string[]) => {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const crownHeaders = new Set(['part name', 'brand', 'qr code', 'buyprice', 'stock', 'image url']);
  if (normalizedHeaders.some((h) => crownHeaders.has(h))) return true;
  const joined = headers.map((header) => normalizeHeaderForMatch(header)).join(' ');
  const matchers = Object.values(fieldMatchers).flat();
  const hasKnownToken = matchers.some((token) => {
    const normToken = normalizeHeaderForMatch(token);
    return joined.includes(normToken) || (token.length >= 2 && joined.toLowerCase().includes(normToken.toLowerCase()));
  });
  const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(joined);
  return hasKnownToken || hasLetters;
};

const buildIndexedMapping = (headers: string[]) => {
  const mapping: Record<string, string> = {};
  if (headers[0]) mapping[headers[0]] = 'sku';
  if (headers[1]) mapping[headers[1]] = 'name';
  if (headers[2]) mapping[headers[2]] = 'brand';
  if (headers[3]) mapping[headers[3]] = 'sellPrice';
  if (headers[4]) mapping[headers[4]] = 'qrCode';
  return mapping;
};

const heuristicColumnMap = (headers: string[]) => {
  const map: Record<string, string> = {};
  headers.forEach((header) => {
    const normalized = normalizeHeader(header);
    const normalizedFull = normalizeHeaderForMatch(header);
    const match = Object.keys(fieldMatchers).find((field) =>
      fieldMatchers[field].some((key) => {
        const nKey = normalizeHeaderForMatch(key);
        return normalized.includes(normalizeHeader(key)) || normalizedFull.includes(nKey) || (key.length >= 2 && (normalized.includes(nKey.toLowerCase()) || normalizedFull.toLowerCase().includes(nKey.toLowerCase())));
      })
    );
    if (match) map[header] = match;
  });
  return map;
};

const aiColumnMap = async (headers: string[]) => {
  if (!GEMINI_API_KEY || !genAI) return null;
  try {
    const result = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `You are a data mapping assistant. Map messy column headers to known product fields.
Known fields: name, nameAr, brand, sku, barcode, qrCode, category, buyPrice, sellPrice, stockQuantity, minStockLevel, imageUrl.
Return ONLY valid JSON object mapping original header to field. Skip unknown headers.
Headers: ${JSON.stringify(headers)}`,
    });
    const text = String((result as any)?.text || '').trim();
    if (!text) return null;
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return parsed as Record<string, string>;
  } catch (error) {
    return null;
  }
};

const mergeColumnMaps = (base: Record<string, string>, ai: Record<string, string> | null) => {
  if (!ai) return base;
  return { ...base, ...ai };
};

const enforcePlanLimits = async (shopId: number, requestedRole: string) => {
  const [shops] = await pool.execute('SELECT package FROM shops WHERE id = ?', [shopId]);
  const shopArray = shops as any[];
  if (shopArray.length === 0) {
    throw new Error('Shop not found');
  }

  const plan = shopArray[0].package as 'bronze' | 'silver' | 'gold';
  const [counts] = await pool.execute(
    'SELECT role, COUNT(*) as count FROM users WHERE shop_id = ? GROUP BY role',
    [shopId]
  );
  const countArray = counts as any[];
  const roleCounts = countArray.reduce<Record<string, number>>((acc, row) => {
    acc[row.role] = row.count;
    return acc;
  }, {});

  if (plan === 'bronze') {
    if (requestedRole === 'warehouse') {
      throw new Error('Bronze plan does not allow warehouse users');
    }
    if (requestedRole === 'shop_owner' && (roleCounts.shop_owner || 0) >= 1) {
      throw new Error('Bronze plan allows only 1 owner');
    }
    if (requestedRole === 'cashier' && (roleCounts.cashier || 0) >= 1) {
      throw new Error('Bronze plan allows only 1 cashier');
    }
  }

  if (plan === 'silver') {
    if (requestedRole === 'shop_owner' && (roleCounts.shop_owner || 0) >= 1) {
      throw new Error('Silver plan allows only 1 owner');
    }
    if (requestedRole === 'cashier' && (roleCounts.cashier || 0) >= 1) {
      throw new Error('Silver plan allows only 1 cashier');
    }
    if (requestedRole === 'warehouse' && (roleCounts.warehouse || 0) >= 1) {
      throw new Error('Silver plan allows only 1 warehouse user');
    }
  }
};

const generateInvoiceNumber = async (shopId?: number) => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const params: any[] = [];
  let where = `WHERE invoice_number LIKE ?`;
  params.push(`${prefix}%`);
  if (shopId) {
    where += ' AND shop_id = ?';
    params.push(shopId);
  }

  const [rows] = await pool.execute(
    `SELECT invoice_number FROM sales ${where} ORDER BY id DESC LIMIT 1`,
    params
  );
  const last = (rows as any[])[0]?.invoice_number as string | undefined;
  const lastNumber = last ? parseInt(last.replace(prefix, ''), 10) : 0;
  const next = String(lastNumber + 1).padStart(4, '0');
  return `${prefix}${next}`;
};

const createSaleAndItems = async (req: any, paymentMethodOverride?: string) => {
  const { items, paymentMethod, customerName, customerPhone, customerAddress } = req.body;
  const shopId = resolveShopId(req);
  if (!shopId) {
    throw new Error('shopId is required');
  }
  if (!items || items.length === 0) {
    throw new Error('Sale items required');
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += item.quantity * item.unitPrice;
    }

    const invoiceNumber = await generateInvoiceNumber(shopId);
    const [saleResult] = await connection.execute(
      `INSERT INTO sales 
       (shop_id, user_id, invoice_number, customer_name, customer_phone, customer_address, total_amount, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        req.user.id,
        invoiceNumber,
        customerName || null,
        customerPhone || null,
        customerAddress || null,
        totalAmount,
        paymentMethodOverride || paymentMethod || 'cash',
      ]
    );
    const saleInsert = saleResult as any;
    const saleId = saleInsert.insertId;

    for (const item of items) {
      await connection.execute(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)',
        [saleId, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice]
      );
      await connection.execute('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [
        item.quantity,
        item.productId,
      ]);
    }

    await connection.execute(
      `INSERT INTO vault_transactions (shop_id, user_id, type, amount, reason, related_sale_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        req.user.id,
        'in',
        totalAmount,
        paymentMethodOverride || paymentMethod || 'sale',
        saleId,
      ]
    );

    await connection.execute(
      `INSERT INTO audit_logs (shop_id, user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        req.user.id,
        'New Sale',
        'sale',
        saleId,
        JSON.stringify({ invoiceNumber, totalAmount, paymentMethod: paymentMethodOverride || paymentMethod || 'cash' }),
        req.ip || null,
      ]
    );

    await connection.commit();

    const [sales] = await connection.execute(
      `
      SELECT s.*, 
             GROUP_CONCAT(
               CONCAT(si.quantity, 'x ', p.name_en, ' @ ', si.unit_price)
               SEPARATOR ', '
             ) as items_summary
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN products p ON si.product_id = p.id
      WHERE s.id = ?
      GROUP BY s.id
      `,
      [saleId]
    );

    return { saleId, sale: (sales as any[])[0], invoiceNumber };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ========== AUTHENTICATION ROUTES ==========
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password, role, package: pkg, shopId } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const requestedRole = role || 'cashier';
    if (!['super_admin', 'shop_owner', 'cashier', 'warehouse'].includes(requestedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (requestedRole !== 'super_admin' && !shopId) {
      return res.status(400).json({ error: 'shopId is required for non-admin users' });
    }

    if (requestedRole !== 'super_admin') {
      try {
        await enforcePlanLimits(shopId, requestedRole);
      } catch (planError: any) {
        if (planError.message === 'Shop not found') {
          return res.status(404).json({ error: 'Shop not found' });
        }
        return res.status(403).json({ error: planError.message });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, role, package, shop_id) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, requestedRole, pkg || 'bronze', shopId || null]
    );

    const insertResult = result as any;
    res.status(201).json({ 
      id: insertResult.insertId, 
      username, 
      role: requestedRole,
      package: pkg || 'bronze'
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    const userArray = users as any[];
    
    if (userArray.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userArray[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, package: user.package, shopId: user.shop_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        package: user.package,
        shopId: user.shop_id
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: any, res: Response) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      package: req.user.package,
      shopId: req.user.shop_id,
    },
  });
});

app.post('/api/auth/register-shop', async (req: Request, res: Response) => {
  try {
    const {
      username,
      password,
      businessName,
      ownerName,
      activityType,
      address,
      contactEmail,
      contactPhone,
      package: pkg,
    } = req.body;

    if (!username || !password || !businessName) {
      return res.status(400).json({ error: 'Username, password, and business name are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [userResult] = await connection.execute(
        'INSERT INTO users (username, password, role, package, shop_id) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, 'shop_owner', pkg || 'bronze', null]
      );
      const userInsert = userResult as any;

      const [shopResult] = await connection.execute(
        `INSERT INTO shops (name, business_name, owner_name, activity_type, address, contact_email, contact_phone, owner_id, package)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessName,
          businessName,
          ownerName || null,
          activityType || null,
          address || null,
          contactEmail || null,
          contactPhone || null,
          userInsert.insertId,
          pkg || 'bronze',
        ]
      );
      const shopInsert = shopResult as any;

      await connection.execute('UPDATE users SET shop_id = ? WHERE id = ?', [shopInsert.insertId, userInsert.insertId]);
      await connection.commit();

      const token = jwt.sign(
        { userId: userInsert.insertId, role: 'shop_owner', package: pkg || 'bronze', shopId: shopInsert.insertId },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        token,
        user: {
          id: userInsert.insertId,
          username,
          role: 'shop_owner',
          package: pkg || 'bronze',
          shopId: shopInsert.insertId,
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const [users] = await pool.execute('SELECT * FROM users WHERE username = ?', [email]);
    const userArray = users as any[];
    if (userArray.length === 0) {
      return res.json({ message: 'If an account exists, a reset link will be sent.' });
    }

    const user = userArray[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.execute(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const resetLink = `${appUrl}/reset-password/${token}`;
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'Reset your Crown ERP password',
      text: `Use this secure link to reset your password: ${resetLink}`,
      html: `<p>Use this secure link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`,
    });

    res.json({ message: 'Password reset email sent' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
      [token]
    );
    const resetArray = rows as any[];
    if (resetArray.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const reset = resetArray[0];
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, reset.user_id]);
    await pool.execute('DELETE FROM password_resets WHERE user_id = ?', [reset.user_id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== GEMINI AI ASSISTANT ==========
app.post('/api/chat', authenticateToken, requirePackageFeature('ai'), async (req: Request, res: Response) => {
  let detectedLang: 'ar' | 'en' = 'en';
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(400).json({ error: 'AI API key is missing' });
    }
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    detectedLang = detectUserLanguage(message);
    const ttsLang = getTtsLocaleForLang(detectedLang);
    console.log('📩 Chat message:', { detectedLang, preview: String(message).slice(0, 120) });

    const resolvedShopId =
      resolveShopId(req) || (req as any).user?.shop_id || (req as any).user?.shopId || 1;
    const shopId = Number(resolvedShopId);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [inventoryRows] = await pool.execute(
      `
      SELECT p.name_en, p.name_ar, p.stock_quantity, p.sell_price, p.brand
      FROM products p
      WHERE p.shop_id = ?
      ORDER BY p.stock_quantity DESC
      LIMIT 200
      `,
      [shopId]
    );

    const [todayStatsRows] = await pool.execute(
      `
      SELECT 
        COALESCE(SUM(s.total_amount), 0) as today_revenue,
        COUNT(DISTINCT s.id) as today_sales
      FROM sales s
      WHERE s.shop_id = ?
      AND DATE(s.created_at) = CURRENT_DATE()
      `,
      [shopId]
    );

    // Past 7 days sales/invoices (read-only analytics context)
    const [last7DaysRows] = await pool.execute(
      `
      SELECT
        DATE(s.created_at) as sale_date,
        COALESCE(SUM(s.total_amount), 0) as revenue,
        COUNT(DISTINCT s.id) as invoices
      FROM sales s
      WHERE s.shop_id = ?
        AND s.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      GROUP BY DATE(s.created_at)
      ORDER BY sale_date ASC
      `,
      [shopId]
    );

    const [yesterdayRows] = await pool.execute(
      `
      SELECT
        COALESCE(SUM(s.total_amount), 0) as revenue,
        COUNT(DISTINCT s.id) as invoices
      FROM sales s
      WHERE s.shop_id = ?
        AND DATE(s.created_at) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      `,
      [shopId]
    );

    const [recentInvoicesRows] = await pool.execute(
      `
      SELECT s.id, s.invoice_number, s.total_amount, s.payment_method, s.customer_name, s.created_at
      FROM sales s
      WHERE s.shop_id = ?
        AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY s.created_at DESC
      LIMIT 25
      `,
      [shopId]
    );

    const [totalProductsRows] = await pool.execute(
      'SELECT COUNT(*) as total_products FROM products WHERE shop_id = ?',
      [shopId]
    );

    const [lowStockCountRows] = await pool.execute(
      'SELECT COUNT(*) as low_stock_count FROM products WHERE shop_id = ? AND stock_quantity <= min_stock_level',
      [shopId]
    );

    const [shopRows] = await pool.execute(
      'SELECT business_name, activity_type FROM shops WHERE id = ?',
      [shopId]
    );
    const shopProfile = (shopRows as any[])[0] || {};

    const inventoryContextAr = (inventoryRows as any[])
      .map((item) => {
        const name = item.name_ar || item.name_en;
        const brand = item.brand ? `, ماركة ${item.brand}` : '';
        return `- ${name}: ${item.stock_quantity} في المخزن، السعر ${item.sell_price} جنيه${brand}`;
      })
      .join('\n');

    const inventoryContextEn = (inventoryRows as any[])
      .map((item) => {
        const name = item.name_en || item.name_ar;
        const brand = item.brand ? `, brand ${item.brand}` : '';
        return `- ${name}: ${item.stock_quantity} in stock, price ${item.sell_price} EGP${brand}`;
      })
      .join('\n');

    const stats = (todayStatsRows as any[])[0] || { today_revenue: 0, today_sales: 0 };
    const totalProducts = Number((totalProductsRows as any[])[0]?.total_products || 0);
    const lowStockCount = Number((lowStockCountRows as any[])[0]?.low_stock_count || 0);
    const yesterday = (yesterdayRows as any[])[0] || { revenue: 0, invoices: 0 };

    const last7 = (last7DaysRows as any[]).map((row) => ({
      date: row.sale_date ? String(row.sale_date).slice(0, 10) : null,
      revenue: Number(row.revenue || 0),
      invoices: Number(row.invoices || 0),
    }));

    const last7DaysContextAr =
      last7.length > 0
        ? last7
            .map((d) => `- ${d.date}: ${d.revenue} جنيه — ${d.invoices} فاتورة`)
            .join('\n')
        : 'لا توجد مبيعات خلال آخر 7 أيام.';

    const last7DaysContextEn =
      last7.length > 0
        ? last7
            .map((d) => `- ${d.date}: ${d.revenue} EGP — ${d.invoices} invoices`)
            .join('\n')
        : 'No sales in the last 7 days.';

    const recentInvoices = (recentInvoicesRows as any[]).map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      totalAmount: Number(row.total_amount || 0),
      paymentMethod: row.payment_method,
      customerName: row.customer_name,
      createdAt: row.created_at,
    }));

    const rawUserName = (req as any).user?.username || '';
    const firstToken = String(rawUserName || '').split(' ')[0];
    const userName = firstToken && !firstToken.includes('@') ? firstToken : 'Ahmed';
    const businessName = shopProfile.business_name || (detectedLang === 'en' ? 'the shop' : 'المحل');
    const activityType = String(shopProfile.activity_type || '').toLowerCase();
    const businessType =
      activityType === 'pharmacy'
        ? 'pharmacy'
        : activityType === 'supermarket'
        ? 'supermarket'
        : activityType === 'decor'
        ? 'decor'
        : 'auto_parts';

    const businessTypeAr =
      businessType === 'pharmacy'
        ? 'صيدلية'
        : businessType === 'supermarket'
        ? 'سوبر ماركت'
        : businessType === 'decor'
        ? 'ديكور ومفروشات'
        : 'قطع غيار سيارات';

    const systemPromptAr = `إنت مساعد ذكي اسمك "كراون" — بتتكلم باللهجة المصرية بطريقة ودودة وبستايل سايبربانك (نيون/سيستم/شبكات) من غير مبالغة.
إنت متخصص في مساعدة أصحاب المحلات في إدارة المخزون والمبيعات داخل Crown Services ERP.

إنت بتتكلم مع "${userName}" صاحب "${businessName}". نادِه باسمه أحياناً عشان يحس بالتخصيص.

ملخص المبيعات (Sales/Invoices) لآخر 7 أيام:
${last7DaysContextAr}

مبيعات امبارح: ${Number(yesterday.revenue || 0)} جنيه — ${Number(yesterday.invoices || 0)} فاتورة

آخر 25 فاتورة خلال 7 أيام (للإجابة على أسئلة زي "امبارح بعنا كام؟"):
${recentInvoices.length ? JSON.stringify(recentInvoices, null, 2) : 'لا توجد فواتير خلال آخر 7 أيام.'}

معلومات عن المخزون الحالي:
${inventoryContextAr || 'لا توجد منتجات في المخزن حالياً'}

إحصائيات اليوم:
- إجمالي المبيعات: ${stats.today_revenue} جنيه
- عدد الفواتير: ${stats.today_sales}
- إجمالي المنتجات: ${totalProducts}
- منتجات قليلة المخزون: ${lowStockCount}

نوع النشاط: ${businessTypeAr}

قواعد مهمة:
- أنت تعرف فقط بيانات هذا المحل (Shop ${shopId}) ولا تكشف أي معلومات عن محلات أو مستخدمين آخرين.
- لو رسالة المستخدم عربية/مصري: رد بالمصري فقط (لهجة مصرية) وبنَفَس سايبربانك. ممنوع الإنجليزية وممنوع الفصحى.
- رد باختصار + خطوات عملية.
- لو سؤاله عن "امبارح" أو "آخر 7 أيام": استخدم أرقام الملخص اللي فوق زي ما هي، ومتخمنش.
- لو المستخدم سأل عن منتج، ابحث عنه في البيانات المعروضة وادّي توصية واضحة (إعادة طلب/تسعير/تنبيه مخزون).
- لو الرسالة إنجليزية، لا ترد بالعربي أبداً.`;

    const systemPromptEn = `You are "Crown", an AI assistant for Crown Services ERP.
Respond in professional English. Be concise, actionable, and accurate.

You are speaking with "${userName}", the owner of "${businessName}".

Sales/Invoices summary (past 7 days):
${last7DaysContextEn}

Yesterday: ${Number(yesterday.revenue || 0)} EGP — ${Number(yesterday.invoices || 0)} invoices

Recent invoices (last 7 days, up to 25):
${recentInvoices.length ? JSON.stringify(recentInvoices, null, 2) : 'No invoices in the last 7 days.'}

Inventory snapshot (this shop only):
${inventoryContextEn || 'No products found in inventory.'}

Today stats:
- Revenue today: ${stats.today_revenue} EGP
- Invoices today: ${stats.today_sales}
- Total products: ${totalProducts}
- Low stock products: ${lowStockCount}

Business type: ${businessType}

Rules:
- Only use this shop's data (Shop ${shopId}). Do not mention or infer other shops/users.
- If the user asks about a specific product, look for it in the inventory list above and answer precisely.
- If the user asks about yesterday / last 7 days sales, use the provided summary numbers exactly. Do not guess.
- If the user message is Arabic, do not reply in English.`;

    const systemPrompt = detectedLang === 'ar' ? systemPromptAr : systemPromptEn;
    const userLine = detectedLang === 'ar' ? `رسالة العميل: ${message}` : `User says: ${message}`;

    const result = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: [systemPrompt, userLine],
    });
    const text = String((result as any)?.text || '').trim();

    if (text) {
      res.json({ message: text, lang: detectedLang, ttsLang });
    } else {
      console.error('❌ Gemini empty response');
      return res.status(500).json({ error: 'AI provider response empty' });
    }
  } catch (error: any) {
    console.error('❌ Chat error:', {
      name: error?.name,
      message: error?.message,
      status: error?.status,
    });
    const ttsLang = getTtsLocaleForLang(detectedLang);
    res.status(500).json({
      error: detectedLang === 'ar' ? 'المساعد في استراحة قصيرة' : 'Assistant is temporarily unavailable',
      lang: detectedLang,
      ttsLang,
    });
  }
});

// ========== GEMINI DATA CHAT (Gold only) ==========
app.post('/api/ai/data-chat', authenticateToken, requirePackageFeature('ai'), async (req: any, res: Response) => {
  try {
    if (!GEMINI_API_KEY || !genAI) {
      return res.status(400).json({ error: 'AI API key is missing' });
    }
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const shopId = resolveShopId(req);
    const params: any[] = [];
    let whereClause = 'WHERE 1=1';
    if (shopId) {
      whereClause += ' AND s.shop_id = ?';
      params.push(shopId);
    } else if (req.user.role !== 'super_admin') {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [stats] = await pool.execute(
      `
      SELECT 
        COALESCE(SUM(s.total_amount), 0) as monthly_revenue,
        COUNT(DISTINCT s.id) as transactions
      FROM sales s
      ${whereClause}
      AND MONTH(s.created_at) = MONTH(CURRENT_DATE())
      AND YEAR(s.created_at) = YEAR(CURRENT_DATE())
      `,
      params
    );

    const [lowStock] = await pool.execute(
      `
      SELECT p.name_en, p.name_ar, p.stock_quantity, p.min_stock_level
      FROM products p
      WHERE p.stock_quantity <= p.min_stock_level
      ${shopId ? 'AND p.shop_id = ?' : ''}
      ORDER BY p.stock_quantity ASC
      LIMIT 10
      `,
      shopId ? [shopId] : []
    );

    const [inventorySummary] = await pool.execute(
      `
      SELECT COUNT(*) as total_products,
             COALESCE(SUM(p.stock_quantity), 0) as total_units,
             COALESCE(SUM(p.buy_price * p.stock_quantity), 0) as inventory_cost
      FROM products p
      ${shopId ? 'WHERE p.shop_id = ?' : ''}
      `,
      shopId ? [shopId] : []
    );

    const [recentSales] = await pool.execute(
      `
      SELECT s.invoice_number, s.total_amount, s.created_at
      FROM sales s
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT 5
      `,
      params
    );

    const [todaySales] = await pool.execute(
      `
      SELECT COALESCE(SUM(s.total_amount), 0) as today_revenue,
             COUNT(s.id) as today_transactions
      FROM sales s
      ${whereClause}
      AND DATE(s.created_at) = CURRENT_DATE()
      `,
      params
    );

    const [topCustomers] = await pool.execute(
      `
      SELECT s.customer_name, SUM(s.total_amount) as total_spent, COUNT(s.id) as orders
      FROM sales s
      ${whereClause}
      AND s.customer_name IS NOT NULL AND s.customer_name <> ''
      GROUP BY s.customer_name
      ORDER BY total_spent DESC
      LIMIT 3
      `,
      params
    );

    let shopProfile = null;
    if (shopId) {
      const [shopRows] = await pool.execute(
        'SELECT business_name, owner_name, activity_type FROM shops WHERE id = ?',
        [shopId]
      );
      shopProfile = (shopRows as any[])[0] || null;
    }

    const summary = {
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
      },
      shopProfile,
      shopId: shopId || null,
      monthlyRevenue: (stats as any[])[0]?.monthly_revenue || 0,
      monthlyTransactions: (stats as any[])[0]?.transactions || 0,
      todayRevenue: (todaySales as any[])[0]?.today_revenue || 0,
      todayTransactions: (todaySales as any[])[0]?.today_transactions || 0,
      inventory: {
        totalProducts: (inventorySummary as any[])[0]?.total_products || 0,
        totalUnits: (inventorySummary as any[])[0]?.total_units || 0,
        inventoryCost: (inventorySummary as any[])[0]?.inventory_cost || 0,
      },
      lowStock,
      topCustomers,
      recentSales,
    };

    const result = await genAI.models.generateContent({
      model: GEMINI_MODEL,
      contents: `أنت كراون - المساعد الذكي. استخدم البيانات التالية فقط للإجابة، ولو السؤال خارج البيانات قول إن المعلومة مش متاحة. رد باللهجة المصرية وباختصار.\n\nالبيانات:\n${JSON.stringify(
        summary,
        null,
        2
      )}\n\nسؤال المستخدم: ${question}`,
    });
    const text = String((result as any)?.text || '').trim();

    if (text) {
      res.json({ text, data: summary });
    } else {
      console.error('❌ Gemini empty response');
      return res.status(500).json({ error: 'AI provider response empty' });
    }
  } catch (error: any) {
    console.error('❌ Data chat error:', error);
    res.status(500).json({ error: 'AI data chat unavailable' });
  }
});

// ========== SHOPS MANAGEMENT (Super Admin only) ==========
app.get('/api/shops', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const [shops] = await pool.execute(`
      SELECT s.*, u.username as owner_name 
      FROM shops s 
      LEFT JOIN users u ON s.owner_id = u.id
    `);
    res.json(shops);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shops', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { name, ownerId, package: pkg } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO shops (name, owner_id, package) VALUES (?, ?, ?)',
      [name, ownerId, pkg || 'bronze']
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, name, ownerId, package: pkg || 'bronze' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SHOP PROFILE ==========
app.get('/api/shops/profile', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [shops] = await pool.execute('SELECT * FROM shops WHERE id = ?', [shopId]);
    const shopArray = shops as any[];
    if (shopArray.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    res.json(shopArray[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/shops/profile', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const {
      businessName,
      ownerName,
      activityType,
      address,
      contactEmail,
      contactPhone,
      logoUrl,
      countryName,
      currencyCode,
      currencySymbol,
    } = req.body;

    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    await pool.execute(
      `UPDATE shops 
       SET business_name = ?, owner_name = ?, activity_type = ?, address = ?, contact_email = ?, contact_phone = ?, logo_url = ?,
           country_name = ?, currency_code = ?, currency_symbol = ?
       WHERE id = ?`,
      [
        businessName,
        ownerName,
        activityType,
        address,
        contactEmail,
        contactPhone,
        logoUrl,
        countryName,
        currencyCode,
        currencySymbol,
        shopId,
      ]
    );

    const [shops] = await pool.execute('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json((shops as any[])[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== STORE DOMAINS (Store Admin - shop_owner) ==========
app.post('/api/domains/add', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const domain = normalizeDomainInput(req.body?.domain);
    validateDomainOrThrow(domain);

    const methodRaw = String(req.body?.verificationMethod || 'txt').toLowerCase();
    const verificationMethod: 'txt' | 'cname' = methodRaw === 'cname' ? 'cname' : 'txt';

    const token = crypto.randomBytes(32).toString('hex');

    try {
      await pool.execute(
        `INSERT INTO domains (shop_id, domain, status, is_active, verification_method, verification_token)
         VALUES (?, ?, 'pending', 0, ?, ?)`,
        [shopId, domain, verificationMethod, token]
      );
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Domain already in use' });
      }
      throw error;
    }

    const recordName = dnsNameForDomain(domain);
    const dnsRecord =
      verificationMethod === 'txt'
        ? { type: 'TXT', name: recordName, value: expectedTxtValue(token) }
        : { type: 'CNAME', name: recordName, value: expectedCnameTarget(token) };

    return res.status(201).json({
      shopId,
      domain,
      status: 'pending',
      isActive: false,
      verificationMethod,
      verificationToken: token,
      dns: dnsRecord,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

app.post('/api/domains/verify', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const domain = normalizeDomainInput(req.body?.domain);
    validateDomainOrThrow(domain);

    const [rows] = await pool.execute(
      `SELECT id, domain, shop_id, status, is_active, verification_method, verification_token, verified_at
       FROM domains
       WHERE shop_id = ? AND domain = ?
       LIMIT 1`,
      [shopId, domain]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Domain not found' });

    const method = (row.verification_method as 'txt' | 'cname') || 'txt';
    const token = String(row.verification_token || '');
    if (!token) return res.status(500).json({ error: 'Domain token missing' });

    const ok = await verifyDomainDns(domain, method, token);
    if (!ok) {
      return res.status(409).json({
        error: 'DNS verification failed',
        dns:
          method === 'txt'
            ? { type: 'TXT', name: dnsNameForDomain(domain), value: expectedTxtValue(token) }
            : { type: 'CNAME', name: dnsNameForDomain(domain), value: expectedCnameTarget(token) },
      });
    }

    await pool.execute(
      `UPDATE domains
       SET status = IF(status = 'active', 'active', 'verified'),
           verified_at = IFNULL(verified_at, NOW())
       WHERE id = ? AND shop_id = ?`,
      [row.id, shopId]
    );

    return res.json({ domain, verified: true, verificationMethod: method });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

app.post('/api/domains/activate', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const domain = normalizeDomainInput(req.body?.domain);
    validateDomainOrThrow(domain);

    const [rows] = await pool.execute(
      `SELECT id, domain, verification_method, verification_token, verified_at
       FROM domains
       WHERE shop_id = ? AND domain = ?
       LIMIT 1`,
      [shopId, domain]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Domain not found' });

    if (!row.verified_at) {
      // Best-effort verify (server-side) before activation
      const method = (row.verification_method as 'txt' | 'cname') || 'txt';
      const token = String(row.verification_token || '');
      const ok = token ? await verifyDomainDns(domain, method, token) : false;
      if (!ok) {
        return res.status(409).json({ error: 'Domain must be verified before activation' });
      }
      await pool.execute(
        `UPDATE domains
         SET status = 'verified', verified_at = NOW()
         WHERE id = ? AND shop_id = ?`,
        [row.id, shopId]
      );
    }

    await pool.execute(
      `UPDATE domains
       SET status = 'active',
           is_active = 1,
           activated_at = IFNULL(activated_at, NOW()),
           deactivated_at = NULL
       WHERE id = ? AND shop_id = ? AND verified_at IS NOT NULL`,
      [row.id, shopId]
    );

    return res.json({ domain, active: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

app.post('/api/domains/deactivate', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const domain = normalizeDomainInput(req.body?.domain);
    validateDomainOrThrow(domain);

    const [rows] = await pool.execute(
      `SELECT id FROM domains WHERE shop_id = ? AND domain = ? LIMIT 1`,
      [shopId, domain]
    );
    const row = (rows as any[])[0];
    if (!row) return res.status(404).json({ error: 'Domain not found' });

    await pool.execute(
      `UPDATE domains
       SET status = 'inactive',
           is_active = 0,
           deactivated_at = NOW()
       WHERE id = ? AND shop_id = ?`,
      [row.id, shopId]
    );

    return res.json({ domain, active: false });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Invalid request' });
  }
});

app.get('/api/domains', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [rows] = await pool.execute(
      `SELECT id, domain, status, is_active, verification_method, verification_token,
              verified_at, activated_at, deactivated_at, created_at, updated_at
       FROM domains
       WHERE shop_id = ?
       ORDER BY created_at DESC`,
      [shopId]
    );

    return res.json({
      config: {
        verifyRecordPrefix: DOMAIN_VERIFY_RECORD_PREFIX,
        cnameRoot: DOMAIN_VERIFY_CNAME_ROOT,
      },
      domains: rows,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ========== USERS MANAGEMENT ==========
app.get('/api/users', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [users] = await pool.execute(
      'SELECT id, username, role, package, shop_id, created_at FROM users WHERE shop_id = ? ORDER BY created_at DESC',
      [shopId]
    );
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password, and role are required' });
    }

    const requestedRole = role as string;
    if (!['shop_owner', 'cashier', 'warehouse'].includes(requestedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const shopId = req.user.role === 'super_admin' ? req.body.shopId : req.user.shop_id;
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    try {
      await enforcePlanLimits(shopId, requestedRole);
    } catch (planError: any) {
      if (planError.message === 'Shop not found') {
        return res.status(404).json({ error: 'Shop not found' });
      }
      return res.status(403).json({ error: planError.message });
    }

    const [shopRows] = await pool.execute('SELECT package FROM shops WHERE id = ?', [shopId]);
    const shopArray = shopRows as any[];
    if (shopArray.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    const shopPackage = shopArray[0].package;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password, role, package, shop_id) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPassword, requestedRole, shopPackage || 'bronze', shopId]
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, username, role: requestedRole });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    const userArray = rows as any[];
    if (userArray.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userArray[0];
    const shopId = req.user.role === 'super_admin' ? targetUser.shop_id : req.user.shop_id;
    if (req.user.role !== 'super_admin' && targetUser.shop_id !== shopId) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== LICENSES (Super Admin) ==========
app.get('/api/licenses', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const [licenses] = await pool.execute('SELECT * FROM licenses ORDER BY created_at DESC');
    res.json(licenses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/licenses/generate', authenticateToken, requireRole('super_admin'), async (req: Request, res: Response) => {
  try {
    const { plan, duration, count } = req.body;
    const allowedPlans = ['bronze', 'silver', 'gold'];
    const allowedDurations = ['monthly', 'quarterly', 'yearly', 'lifetime'];
    if (!allowedPlans.includes(plan) || !allowedDurations.includes(duration)) {
      return res.status(400).json({ error: 'Invalid plan or duration' });
    }

    const total = Math.min(parseInt(count || '1', 10), 100);
    const codes: string[] = [];

    for (let i = 0; i < total; i += 1) {
      codes.push(crypto.randomBytes(10).toString('hex').toUpperCase());
    }

    const values = codes.map((code) => [code, plan, duration]);
    await pool.query('INSERT INTO licenses (license_key, plan, duration) VALUES ?', [values]);

    res.status(201).json({ codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/licenses/activate', authenticateToken, async (req: any, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Activation code required' });
    }

    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [licenses] = await pool.execute('SELECT * FROM licenses WHERE license_key = ? AND status = "unused"', [code]);
    const licenseArray = licenses as any[];
    if (licenseArray.length === 0) {
      return res.status(404).json({ error: 'Invalid or used code' });
    }

    const license = licenseArray[0];
    const durationMap: Record<string, number | null> = {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
      lifetime: null,
    };
    const days = durationMap[license.duration] ?? 30;
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    await pool.execute(
      'UPDATE licenses SET status = "active", used_by_user_id = ?, used_at = NOW(), expires_at = ? WHERE id = ?',
      [req.user.id, expiresAt, license.id]
    );

    await pool.execute(
      'UPDATE shops SET package = ?, plan_type = ?, is_active = 1 WHERE id = ?',
      ['gold', 'gold', shopId]
    );
    await pool.execute('UPDATE users SET package = ? WHERE shop_id = ?', ['gold', shopId]);

    res.json({ success: true, plan: 'gold', duration: license.duration, expiresAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/activate', authenticateToken, async (req: any, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Activation code required' });
    }

    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [licenses] = await pool.execute('SELECT * FROM licenses WHERE license_key = ? AND status = "unused"', [code]);
    const licenseArray = licenses as any[];
    if (licenseArray.length === 0) {
      return res.status(404).json({ error: 'Invalid or used code' });
    }

    const license = licenseArray[0];
    const durationMap: Record<string, number | null> = {
      monthly: 30,
      quarterly: 90,
      yearly: 365,
      lifetime: null,
    };
    const days = durationMap[license.duration] ?? 30;
    const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    await pool.execute(
      'UPDATE licenses SET status = "active", used_by_user_id = ?, used_at = NOW(), expires_at = ? WHERE id = ?',
      [req.user.id, expiresAt, license.id]
    );

    await pool.execute(
      'UPDATE shops SET package = ?, plan_type = ?, is_active = 1 WHERE id = ?',
      [license.plan, license.plan, shopId]
    );
    await pool.execute('UPDATE users SET package = ? WHERE shop_id = ?', [license.plan, shopId]);

    res.json({ success: true, plan: license.plan, duration: license.duration, expiresAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== PRODUCTS/INVENTORY ==========
app.get('/api/products/lookup', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const rawCode = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
    const code = String(rawCode || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const [rows] = await pool.execute(
      `SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.shop_id = ?
         AND (p.barcode = ? OR p.sku = ? OR p.qr_code = ?)
       LIMIT 1`,
      [shopId, code, code, code]
    );
    const list = rows as any[];
    if (list.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(list[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    let query = `
      SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params: any[] = [];
    
    query += ' AND p.shop_id = ?';
    params.push(shopId);
    query += ' AND (p.is_deleted = 0 OR p.is_deleted IS NULL)';
    query += ' ORDER BY p.created_at DESC';
    
    const [products] = await pool.execute(query, params);
    res.json(products || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', authenticateToken, requireRole('super_admin', 'shop_owner', 'warehouse'), async (req: any, res: Response) => {
  try {
    const {
      nameEn,
      nameAr,
      brand,
      categoryId,
      buyPrice,
      sellPrice,
      stockQuantity,
      minStockLevel,
      imageUrl,
      sku,
      barcode,
      qrCode,
    } = req.body;
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const limitCheck = await enforceProductLimit(shopId, 1);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        message: `لقد وصلت للحد الأقصى من المنتجات (${limitCheck.maxProducts}). يرجى الترقية للباقة الفضية أو الذهبية.`,
        code: 'PRODUCT_LIMIT_REACHED',
      });
    }

    if (!nameEn) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const [existing] = await pool.execute(
      `SELECT id FROM products 
       WHERE shop_id = ? AND (
         (sku IS NOT NULL AND sku = ?) OR
         (barcode IS NOT NULL AND barcode = ?) OR
         (LOWER(name_en) = LOWER(?)) OR
         (LOWER(name_ar) = LOWER(?))
       )
       LIMIT 1`,
      [shopId, sku || null, barcode || null, nameEn, nameAr || nameEn]
    );
    const existingArray = existing as any[];
    if (existingArray.length > 0) {
      return res.status(400).json({ error: 'Duplicate product detected' });
    }
    
    const computedSellPrice =
      sellPrice ?? (buyPrice ? Number((Number(buyPrice) * 1.2).toFixed(2)) : 0);

    const [result] = await pool.execute(
      `INSERT INTO products 
       (name_en, name_ar, sku, barcode, qr_code, brand, category_id, buy_price, sell_price, stock_quantity, min_stock_level, image_url, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nameEn,
        nameAr || nameEn,
        sku || null,
        barcode || null,
        qrCode || null,
        brand || null,
        categoryId || null,
        buyPrice || 0,
        computedSellPrice,
        stockQuantity || 0,
        minStockLevel || 5,
        imageUrl || null,
        shopId,
      ]
    );
    
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', authenticateToken, requireRole('super_admin', 'shop_owner', 'warehouse'), async (req: any, res: Response) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const {
      nameEn,
      nameAr,
      brand,
      sku,
      barcode,
      qrCode,
      buyPrice,
      sellPrice,
      stockQuantity,
      minStockLevel,
      imageUrl,
      extra_fields: extraFieldsBody,
    } = req.body;

    if (!nameEn) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const computedSellPrice =
      sellPrice ?? (buyPrice ? Number((Number(buyPrice) * 1.2).toFixed(2)) : 0);
    const hasPrice = computedSellPrice > 0 || (buyPrice != null && Number(buyPrice) > 0);
    const isComplete = Boolean(nameEn && hasPrice);
    const missingList: string[] = [];
    if (!nameEn) missingList.push('ProductName');
    if (!hasPrice) missingList.push('SellPrice');
    const missingFieldsJson = missingList.length > 0 ? JSON.stringify(missingList) : null;
    const extraFieldsJson =
      extraFieldsBody != null && typeof extraFieldsBody === 'object'
        ? JSON.stringify(extraFieldsBody)
        : null;

    await pool.execute(
      `UPDATE products 
       SET name_en = ?, name_ar = ?, sku = ?, barcode = ?, qr_code = ?, brand = ?, buy_price = ?, sell_price = ?,
           stock_quantity = ?, min_stock_level = ?, image_url = ?, is_incomplete = ?, missing_fields = ?, extra_fields = ?
       WHERE id = ? AND shop_id = ?`,
      [
        nameEn,
        nameAr || nameEn,
        sku || null,
        barcode || null,
        qrCode || null,
        brand || null,
        buyPrice || 0,
        computedSellPrice,
        stockQuantity || 0,
        minStockLevel || 5,
        imageUrl || null,
        isComplete ? 0 : 1,
        isComplete ? null : missingFieldsJson,
        extraFieldsJson,
        productId,
        shopId,
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole('super_admin', 'shop_owner', 'warehouse'), async (req: any, res: Response) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    const [result] = await pool.execute(
      'UPDATE products SET is_deleted = 1 WHERE id = ? AND shop_id = ?',
      [productId, shopId]
    );
    const affected = (result as any).affectedRows;
    if (affected === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const handleProductsImportUpload = async (
  req: any,
  res: Response,
  opts?: { forceImportMode?: boolean }
) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    // Supports a PowerQuery-like flow:
    // - GET/POST ?mode=analyze : read headers + guess mapping + validate (no DB writes)
    // - POST ?mode=import     : import with provided mapping + policies
    const rawModeFromQuery = String((req as any)?.query?.mode || '').trim();
    const queryModeRaw = opts?.forceImportMode ? 'import' : rawModeFromQuery;
    const modeLocked = opts?.forceImportMode ? true : Boolean(queryModeRaw);
    let mode: 'analyze' | 'import' = queryModeRaw.toLowerCase() === 'analyze' ? 'analyze' : 'import';

    const limitCheck = await enforceProductLimit(shopId, 0);
    if (!limitCheck.allowed) {
      const remaining = limitCheck.remaining ?? 0;
      if (mode === 'import') {
        return res.status(403).json({
          message: `الحد الأقصى للمنتجات في باقتك ${limitCheck.maxProducts}. لديك ${limitCheck.existingCount} منتج حالياً ويمكنك إضافة ${remaining} منتج فقط. يرجى الترقية للباقة الفضية أو الذهبية.`,
          code: 'PRODUCT_LIMIT_REACHED',
        });
      }
    }
    const maxProducts = limitCheck.maxProducts ?? null;
    const existingCount = limitCheck.existingCount ?? 0;

    const [existing] = await pool.execute(
      'SELECT id, name_en, name_ar, sku, barcode, qr_code FROM products WHERE shop_id = ?',
      [shopId]
    );
    const existingProducts = existing as any[];
    const skuSet = new Set(existingProducts.map((p) => normalizeText(p.sku)).filter(Boolean));
    const barcodeSet = new Set(existingProducts.map((p) => normalizeText(p.barcode)).filter(Boolean));
    const qrSet = new Set(existingProducts.map((p) => normalizeText(p.qr_code)).filter(Boolean));
    const nameSet = new Set(
      existingProducts
        .flatMap((p) => [normalizeText(p.name_en), normalizeText(p.name_ar)])
        .filter(Boolean)
    );

    const [categories] = await pool.execute(
      'SELECT id, name_en, name_ar FROM categories WHERE shop_id = ? OR shop_id IS NULL',
      [shopId]
    );
    const categoryRows = categories as any[];
    const categoryMap = new Map<string, number>();
    categoryRows.forEach((cat) => {
      categoryMap.set(normalizeText(cat.name_en), cat.id);
      categoryMap.set(normalizeText(cat.name_ar), cat.id);
    });

    const profile: any = {
      totalRows: 0,
      columns: {},
    };
    const skipped: Array<{ row: number; reason: string }> = [];
    let importedCount = 0;
    let draftCountTotal = 0;
    const batch: any[] = [];
    const batchSize = 200;
    const allowedImportFields = new Set(Object.keys(fieldMatchers));
    const englishToInternal: Record<string, string> = {
      ProductName: 'name',
      ProductNameAR: 'nameAr',
      SellPrice: 'sellPrice',
      BuyPrice: 'buyPrice',
      Stock: 'stockQuantity',
      SKU: 'sku',
      Barcode: 'barcode',
      QR: 'qrCode',
      Brand: 'brand',
      Category: 'category',
      ImageURL: 'imageUrl',
      MinStock: 'minStockLevel',
    };
    const internalToEnglish: Record<string, string> = {
      name: 'ProductName',
      nameAr: 'ProductNameAR',
      sellPrice: 'SellPrice',
      buyPrice: 'BuyPrice',
      stockQuantity: 'Stock',
      sku: 'SKU',
      barcode: 'Barcode',
      qrCode: 'QR',
      brand: 'Brand',
      category: 'Category',
      imageUrl: 'ImageURL',
      minStockLevel: 'MinStock',
    };

    type MissingPricePolicy = 'skip' | 'default' | 'zero';
    let missingPricePolicy: MissingPricePolicy = 'skip';
    let defaultSellPrice: number | null = null;
    let clientColumnMap: Record<string, string> | null = null;
    let mappingValidation: ImportMappingValidation = { ok: true, missingFields: [] };
    let analyzeError: string | null = null;
    const samples: Record<string, string[]> = {};
    const analysis = {
      validRows: 0,
      readyRows: 0,
      emptyNameCount: 0,
      emptyPriceCount: 0,
      duplicateSkuCount: 0,
      duplicateBarcodeCount: 0,
      duplicateNameCount: 0,
      productLimitReachedCount: 0,
    };
    const issueSamples: Record<string, Array<{ row: number; value?: string }>> = {
      emptyNameRows: [],
      emptyPriceRows: [],
    };

    const safeParseClientColumnMap = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const out: Record<string, string> = {};
        Object.entries(parsed).forEach(([key, value]) => {
          const k = String(key || '').trim();
          let f = String(value || '').trim();
          if (!k || !f) return;
          if (f.startsWith('custom:') || f.startsWith('custom_')) {
            out[k] = f.startsWith('custom:') ? `custom_${f.slice(7)}` : f;
            return;
          }
          const internal = englishToInternal[f] || f;
          if (allowedImportFields.has(internal)) {
            out[k] = internal;
            return;
          }
          out[k] = f.startsWith('custom_') ? f : `custom_${f}`;
        });
        return out;
      } catch {
        return null;
      }
    };

    const updateProfile = (headers: string[], row: Record<string, any>) => {
      profile.totalRows += 1;
      headers.forEach((header) => {
        if (!profile.columns[header]) {
          profile.columns[header] = {
            emptyCount: 0,
            nonEmptyCount: 0,
            numericCount: 0,
            textCount: 0,
            duplicateCount: 0,
            uniqueCount: 0,
            uniqueValues: new Map<string, number>(),
          };
        }
        const cell = row[header];
        const cellText = cell === null || cell === undefined ? '' : String(cell).trim();
        const meta = profile.columns[header];
        if (!cellText) {
          meta.emptyCount += 1;
          return;
        }
        meta.nonEmptyCount += 1;
        const numeric = normalizeNumber(cellText);
        if (numeric !== null) meta.numericCount += 1;
        else meta.textCount += 1;

        const normalized = cellText.toLowerCase();
        if (meta.uniqueValues.has(normalized)) {
          meta.uniqueValues.set(normalized, (meta.uniqueValues.get(normalized) || 0) + 1);
          meta.duplicateCount += 1;
        } else if (meta.uniqueValues.size < 2000) {
          meta.uniqueValues.set(normalized, 1);
          meta.uniqueCount += 1;
        }
      });
    };

    const collectSamples = (headers: string[], row: Record<string, any>) => {
      headers.forEach((header) => {
        if (!samples[header]) samples[header] = [];
        if (samples[header].length >= 3) return;
        const cell = row[header];
        const cellText = cell === null || cell === undefined ? '' : String(cell).trim();
        if (!cellText) return;
        samples[header].push(cellText.slice(0, 80));
      });
    };

    const flushBatch = async () => {
      if (mode !== 'import') return;
      if (batch.length === 0) return;
      const values = batch.flat();
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      await pool.execute(
        `INSERT INTO products
         (name_en, name_ar, sku, barcode, qr_code, brand, category_id, buy_price, sell_price, stock_quantity, min_stock_level, image_url, shop_id, is_incomplete, extra_fields, missing_fields)
         VALUES ${placeholders}`,
        values
      );
      draftCountTotal += batch.filter((row) => row[13] === 1).length;
      importedCount += batch.length;
      batch.length = 0;
    };

    const mapAndInsert = async (
      row: Record<string, any>,
      headers: string[],
      columnMap: Record<string, string>,
      rowIndex: number
    ) => {
      const isAnalyze = mode === 'analyze';
      const logPrefix = isAnalyze ? `[ANALYZE] Row ${rowIndex}` : `[IMPORT] Row ${rowIndex}`;

      const skipRow = (reason: string) => {
        if (isAnalyze) {
          if (reason === 'Empty row') {
            analysis.emptyNameCount += 1;
          } else if (reason === 'Product limit reached') {
            analysis.productLimitReachedCount += 1;
          }
          return;
        }
        skipped.push({ row: rowIndex, reason });
        console.log(`${logPrefix} skipped: ${reason}`);
      };

      if (maxProducts !== null && existingCount + importedCount + batch.length >= maxProducts) {
        skipRow('Product limit reached');
        return;
      }

      const allRowValuesEmpty =
        Object.keys(row).length === 0 ||
        Object.values(row).every(
          (v) => v === undefined || v === null || String(v).trim() === ''
        );
      if (allRowValuesEmpty) {
        skipRow('Empty row');
        return;
      }

      // columnMap is HEADER -> FIELD. Resolve row values by columnMap only.
      const mapped: any = {};
      Object.entries(columnMap).forEach(([header, field]) => {
        let val = row[header];
        if (val === undefined && header) {
          const rowKey = Object.keys(row).find(
            (k) =>
              String(k).trim().toLowerCase() === String(header).trim().toLowerCase()
          );
          val = rowKey !== undefined ? row[rowKey] : undefined;
        }
        mapped[field] = val;
      });

      let skuRaw = String(mapped.sku ?? '').trim();
      let barcodeRaw = String(mapped.barcode ?? '').trim();
      const qrRaw = String(mapped.qrCode ?? '').trim();
      const imageUrlRaw = String(mapped.imageUrl ?? '').trim();
      if (!barcodeRaw && qrRaw) barcodeRaw = qrRaw;
      if (!skuRaw && (barcodeRaw || qrRaw)) skuRaw = barcodeRaw || qrRaw;

      const nameFromMap = normalizeText(mapped.name || mapped.nameAr);
      const fallbackName =
        nameFromMap ||
        (skuRaw || barcodeRaw ? `Draft ${skuRaw || barcodeRaw}` : `Unnamed Item #${rowIndex}`);
      const nameEn =
        mapped.name && String(mapped.name).trim()
          ? String(mapped.name).trim()
          : fallbackName;
      const nameAr =
        mapped.nameAr && String(mapped.nameAr).trim()
          ? String(mapped.nameAr).trim()
          : nameEn;

      const buyPriceRaw = normalizeNumber(mapped.buyPrice ?? mapped.cost);
      const sellPriceRaw = normalizeNumber(mapped.sellPrice ?? mapped.price ?? mapped.sell);
      const hasSell = sellPriceRaw !== null && sellPriceRaw > 0;
      const hasBuy = buyPriceRaw !== null && buyPriceRaw > 0;

      let sellPrice = 0;
      if (hasSell) {
        sellPrice = Number(sellPriceRaw);
      } else if (hasBuy) {
        sellPrice = Number((Number(buyPriceRaw) * 1.2).toFixed(2));
      } else if (
        mode === 'import' &&
        missingPricePolicy === 'default' &&
        defaultSellPrice != null &&
        Number(defaultSellPrice) > 0
      ) {
        sellPrice = Number(defaultSellPrice);
      }
      const normalizedBuyPrice = buyPriceRaw != null ? Number(buyPriceRaw) : 0;
      const stockQuantity = Math.max(
        0,
        Math.floor(normalizeNumber(mapped.stockQuantity ?? mapped.quantity ?? 0) || 0)
      );
      const minStockLevel = Math.max(
        0,
        Math.floor(normalizeNumber(mapped.minStockLevel ?? 5) || 5)
      );

      let categoryId: number | null = null;
      if (mapped.category) {
        const normalizedCategory = normalizeText(mapped.category);
        if (normalizedCategory) {
          if (categoryMap.has(normalizedCategory)) {
            categoryId = categoryMap.get(normalizedCategory) || null;
          } else if (mode === 'import') {
            const [result] = await pool.execute(
              'INSERT INTO categories (name_en, name_ar, shop_id) VALUES (?, ?, ?)',
              [mapped.category, mapped.category, shopId]
            );
            const insertResult = result as any;
            categoryId = insertResult.insertId;
            if (categoryId !== null) {
              categoryMap.set(normalizedCategory, categoryId);
            }
          }
        }
      }

      const missingFieldsList: string[] = [];
      if (!nameFromMap) missingFieldsList.push(internalToEnglish.name || 'ProductName');
      if (!hasSell) missingFieldsList.push(internalToEnglish.sellPrice || 'SellPrice');
      if (buyPriceRaw == null || buyPriceRaw === 0)
        missingFieldsList.push(internalToEnglish.buyPrice || 'BuyPrice');
      const isIncomplete = missingFieldsList.length > 0 ? 1 : 0;

      const extraFieldsObj: Record<string, string | number> = {};
      Object.entries(mapped).forEach(([field, val]) => {
        if (field.startsWith('custom_') && val !== undefined && val !== null) {
          const s = String(val).trim();
          if (s !== '') extraFieldsObj[field] = typeof val === 'number' ? val : s;
        }
      });
      const extraFieldsJson =
        Object.keys(extraFieldsObj).length > 0 ? JSON.stringify(extraFieldsObj) : null;
      const missingFieldsJson =
        missingFieldsList.length > 0 ? JSON.stringify(missingFieldsList) : null;

      if (mode === 'import') {
        batch.push([
          nameEn,
          nameAr,
          skuRaw || null,
          barcodeRaw || null,
          null,
          mapped.brand || null,
          categoryId,
          normalizedBuyPrice,
          sellPrice,
          stockQuantity,
          minStockLevel,
          imageUrlRaw || null,
          shopId,
          isIncomplete,
          extraFieldsJson,
          missingFieldsJson,
        ]);

        console.log(
          `${logPrefix} queued: name="${String(nameEn).slice(0, 60)}" isIncomplete=${isIncomplete}`
        );

        if (batch.length >= batchSize) {
          await flushBatch();
        }
      } else {
        analysis.validRows += 1;
      }
    };

    const busboy = Busboy({ headers: req.headers, limits: {} });
    let fileFound = false;
    let processDone = false;
    let columnMap: Record<string, string> = {};
    let headers: string[] = [];
    let unmappedColumns: string[] = [];
    let mappingInvalid = false;
    let mappingGuide: any = null;

    busboy.on('field', (fieldName: string, value: string) => {
      const v = String(value || '').trim();
      if (!v) return;
      if (fieldName === 'mode') {
        if (modeLocked) return;
        if (v.toLowerCase() === 'analyze') mode = 'analyze';
        if (v.toLowerCase() === 'import') mode = 'import';
        return;
      }
      if (fieldName === 'columnMap') {
        const parsed = safeParseClientColumnMap(v);
        if (parsed) clientColumnMap = parsed;
        return;
      }
      if (fieldName === 'missingPricePolicy') {
        const p = v.toLowerCase();
        if (p === 'skip' || p === 'default' || p === 'zero') {
          missingPricePolicy = p;
        }
        return;
      }
      if (fieldName === 'defaultSellPrice') {
        const n = normalizeNumber(v);
        defaultSellPrice = n !== null ? Number(n) : null;
      }
    });

    const finalizeProfile = () => {
      const finalizedColumns = Object.fromEntries(
        Object.entries(profile.columns).map(([key, meta]: any) => [
          key,
          {
            emptyRatio: meta.emptyCount / Math.max(profile.totalRows, 1),
            numericRatio: meta.numericCount / Math.max(meta.nonEmptyCount, 1),
            duplicateRatio: meta.duplicateCount / Math.max(meta.nonEmptyCount, 1),
          },
        ])
      );
      return {
        totalRows: profile.totalRows,
        columns: finalizedColumns,
      };
    };

    const finish = async () => {
      if (processDone) return;
      processDone = true;
      if (mode === 'import') {
        await flushBatch();
      }
      const payload = {
        importedCount,
        draftCount: draftCountTotal,
        updatedCount: 0,
        errorsCount: 0,
        skippedCount: skipped.length,
        skipped,
        profile: finalizeProfile(),
        unmappedColumns,
        detectedHeaders: headers,
        currentMapping: columnMap,
      };

      if (mode === 'analyze') {
        const totalRows = Number((payload as any)?.profile?.totalRows || 0);
        const defaultGuide =
          !mappingValidation.ok || analyzeError
            ? buildProductImportMappingGuide(
                headers,
                columnMap,
                analyzeError || 'Map fields for best results'
              )
            : null;
        return res.json({
          ok: !analyzeError,
          error: analyzeError,
          mode,
          limit: limitCheck,
          mappingValidation,
          analysis: {
            totalRows,
            ...analysis,
          },
          issueSamples,
          samples,
          mappingGuide: mappingGuide || defaultGuide,
          ...payload,
        });
      }

      if (mappingInvalid) {
        return res.status(400).json({
          error:
            'Unrecognized inventory file format. Map at least one column and try again.',
          mappingGuide:
            mappingGuide ||
            buildProductImportMappingGuide(
              headers,
              columnMap,
              'Map fields for best results'
            ),
          ...payload,
        });
      }

      return res.json(payload);
    };

    const streamToBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

    busboy.on('file', async (_fieldName: string, file: NodeJS.ReadableStream, info: any) => {
      if (fileFound) {
        file.resume();
        return;
      }
      fileFound = true;
      const filename = info.filename || '';
      const lower = filename.toLowerCase();
      const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
      const isCsv = ext === '.csv';
      const isExcel = ext === '.xlsx' || ext === '.xlsm';
      if (!isCsv && !isExcel) {
        analyzeError = 'Unsupported file type. Use .xlsx, .xlsm, or .csv';
        file.resume();
        await finish();
        return;
      }

      const setHeaderRowAndMap = async (headerRow: string[]) => {
        const headerLike = isHeaderLike(headerRow);
        if (!headerLike) {
          columnMap = {};
          unmappedColumns = headerRow;
          mappingInvalid = true;
          analyzeError = 'No header row detected';
          mappingGuide = buildProductImportMappingGuide(
            headerRow,
            columnMap,
            'No header row detected'
          );
          return false;
        }
        const heuristicMap = heuristicColumnMap(headerRow);
        const aiMap = await aiColumnMap(headerRow);
        const autoMap = mergeColumnMaps(heuristicMap, aiMap);
        columnMap = clientColumnMap ? clientColumnMap : autoMap;
        unmappedColumns = headerRow.filter((header) => !columnMap[header]);
        const validation = validateProductImportMapping(columnMap);
        mappingValidation = validation;
        mappingInvalid = false;
        if (mode === 'analyze' && !validation.ok) {
          mappingGuide = buildProductImportMappingGuide(
            headerRow,
            columnMap,
            'Map fields for best results'
          );
        }
        return true;
      };

      try {
        if (lower.endsWith('.csv')) {
          const buffer = await streamToBuffer(file);
          const rows: Record<string, string>[] = [];
          await new Promise<void>((resolveParse, rejectParse) => {
            const parser = csvParser({ headers: false });
            const src = Readable.from(buffer);
            src.pipe(parser)
              .on('data', (row: Record<string, string>) => rows.push(row))
              .on('end', () => resolveParse())
              .on('error', rejectParse);
          });
          const orderedValues = (row: Record<string, string>) => {
            const keys = Object.keys(row)
              .filter((k) => /^\d+$/.test(k))
              .map(Number)
              .sort((a, b) => a - b);
            return keys.map((k) => String((row as any)[String(k)] ?? '').trim());
          };
          const nonEmptyCount = (row: Record<string, string>) =>
            Object.values(row).filter((v) => String(v ?? '').trim() !== '').length;
          const rowHasNonEmpty = (row: Record<string, string>) => nonEmptyCount(row) > 0;
          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (nonEmptyCount(rows[i]) >= 2) {
              headerRowIndex = i;
              break;
            }
          }
          if (headerRowIndex === -1) {
            analyzeError = 'Excel file has no data rows';
            await finish();
            return;
          }
          headers = orderedValues(rows[headerRowIndex]).map((h) => String(h || '').trim());
          const dataRows = rows.slice(headerRowIndex + 1).filter(rowHasNonEmpty);
          if (dataRows.length === 0) {
            analyzeError = 'Excel file has no data rows';
            await finish();
            return;
          }
          const ok = await setHeaderRowAndMap(headers);
          if (!ok) {
            await finish();
            return;
          }
          let rowIndex = 1;
          for (const row of dataRows) {
            if (processDone) break;
            rowIndex += 1;
            const values = orderedValues(row);
            const rowObj: Record<string, any> = {};
            headers.forEach((h, i) => {
              rowObj[h] = values[i] !== undefined ? values[i] : '';
            });
            updateProfile(headers, rowObj);
            collectSamples(headers, rowObj);
            await mapAndInsert(rowObj, headers, columnMap, rowIndex);
          }
          await finish();
          return;
        }

        const buffer = await streamToBuffer(file);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const sheet = workbook.worksheets[0];
        if (!sheet) {
          analyzeError = 'Excel file has no worksheets';
          await finish();
          return;
        }
        const excelRows: string[][] = [];
        sheet.eachRow((row, _rowNum) => {
          const raw = (row.values as any[]) || [];
          const values: string[] = [];
          for (let i = 1; i < raw.length; i++) values.push(String(raw[i] ?? '').trim());
          excelRows.push(values);
        });
        const nonEmptyCountArr = (arr: string[]) => arr.filter((c) => String(c).trim() !== '').length;
        const rowHasNonEmptyArr = (arr: string[]) => nonEmptyCountArr(arr) > 0;
        let headerRowIndex = -1;
        for (let i = 0; i < excelRows.length; i++) {
          if (nonEmptyCountArr(excelRows[i]) >= 2) {
            headerRowIndex = i;
            break;
          }
        }
        if (headerRowIndex === -1) {
          analyzeError = 'Excel file has no data rows';
          await finish();
          return;
        }
        const maxCol = Math.max(...excelRows.map((r) => r.length), 0);
        headers = excelRows[headerRowIndex].slice(0, maxCol);
        while (headers.length < maxCol) headers.push('');
        const dataRows = excelRows.slice(headerRowIndex + 1).filter((r) => rowHasNonEmptyArr(r));
        if (dataRows.length === 0) {
          analyzeError = 'Excel file has no data rows';
          await finish();
          return;
        }
        const ok = await setHeaderRowAndMap(headers);
        if (!ok) {
          await finish();
          return;
        }
        let rowIndex = 1;
        for (const values of dataRows) {
          if (processDone) break;
          rowIndex += 1;
          const rowData: Record<string, any> = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index] !== undefined ? values[index] : '';
          });
          updateProfile(headers, rowData);
          collectSamples(headers, rowData);
          await mapAndInsert(rowData, headers, columnMap, rowIndex);
        }
        await finish();
      } catch (err: any) {
        analyzeError = err?.message || 'Failed to parse file';
        await finish();
      }
    });

    busboy.on('finish', async () => {
      if (!fileFound) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      if (!processDone) {
        await finish();
      }
    });

    req.pipe(busboy);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

app.post(
  '/api/products/import',
  authenticateToken,
  requirePackageFeature('excel'),
  requireRole('super_admin', 'shop_owner', 'warehouse'),
  async (req: any, res: Response) => {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('multipart/form-data')) {
      return handleProductsImportUpload(req, res, { forceImportMode: true });
    }

    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      const shopId = resolveShopId(req);
      if (!shopId) {
        return res.status(400).json({ error: 'shopId is required' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error:
            'No items received. If uploading a file, send multipart/form-data without setting Content-Type manually.',
        });
      }

      const limitCheck = await enforceProductLimit(shopId, items.length);
      if (!limitCheck.allowed) {
        const remaining = limitCheck.remaining ?? 0;
        return res.status(403).json({
          message: `الحد الأقصى للمنتجات في باقتك ${limitCheck.maxProducts}. لديك ${limitCheck.existingCount} منتج حالياً ويمكنك إضافة ${remaining} منتج فقط. يرجى الترقية للباقة الفضية أو الذهبية.`,
          code: 'PRODUCT_LIMIT_REACHED',
        });
      }

      const [existing] = await pool.execute(
        'SELECT id, name_en, name_ar, sku, barcode, qr_code FROM products WHERE shop_id = ?',
        [shopId]
      );
      const existingProducts = existing as any[];
      const skuSet = new Set(existingProducts.map((p) => normalizeText(p.sku)).filter(Boolean));
      const barcodeSet = new Set(
        existingProducts.map((p) => normalizeText(p.barcode)).filter(Boolean)
      );
      const qrSet = new Set(
        existingProducts.map((p) => normalizeText(p.qr_code)).filter(Boolean)
      );
      const nameSet = new Set(
        existingProducts
          .flatMap((p) => [normalizeText(p.name_en), normalizeText(p.name_ar)])
          .filter(Boolean)
      );

      const imported: any[] = [];
      const skipped: Array<{ row: number; reason: string }> = [];
      let draftCount = 0;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const nameRaw = normalizeText(item.name || item.nameEn || item.nameAr);
        let sku = normalizeText(item.sku);
        let barcode = normalizeText(item.barcode);
        let qrCode = normalizeText(item.qrCode);

        const allRowValuesEmpty =
          !nameRaw &&
          !sku &&
          !barcode &&
          !qrCode &&
          !normalizeText(item.brand) &&
          !normalizeText(item.category) &&
          !normalizeText(item.imageUrl) &&
          !normalizeText(item.sellPrice) &&
          !normalizeText(item.buyPrice) &&
          !normalizeText(item.stockQuantity);
        if (allRowValuesEmpty) {
          skipped.push({ row: index + 1, reason: 'Empty row' });
          continue;
        }

        if (sku && skuSet.has(sku)) {
          sku = '';
        }
        if (barcode && barcodeSet.has(barcode)) {
          barcode = '';
        }
        if (qrCode && qrSet.has(qrCode)) {
          qrCode = '';
        }

        let nameValue =
          item.nameEn ||
          item.nameAr ||
          item.name ||
          nameRaw ||
          (sku || barcode ? `Draft ${sku || barcode}` : `Unnamed Item #${index + 1}`);
        let nameForDedup = normalizeText(nameValue);
        if (nameForDedup && nameSet.has(nameForDedup)) {
          nameValue =
            sku || barcode
              ? `Draft ${sku || barcode}`
              : `Unnamed Item #${index + 1}`;
          nameForDedup = normalizeText(nameValue);
        }

        const sellPriceRaw = parseFloat(item.sellPrice || item.price || '0');
        const buyPrice = parseFloat(item.buyPrice || item.cost || '0') || 0;
        const sellPrice =
          sellPriceRaw > 0
            ? sellPriceRaw
            : buyPrice > 0
            ? Number((buyPrice * 1.2).toFixed(2))
            : 0;
        const stockQuantity = parseInt(item.stockQuantity || item.quantity || '0', 10) || 0;
        const minStockLevel = parseInt(item.minStockLevel || item.minStock || '5', 10) || 5;

        const missingFieldsList: string[] = [];
        if (!nameRaw) missingFieldsList.push('ProductName');
        if (sellPrice <= 0 && buyPrice <= 0) missingFieldsList.push('SellPrice');
        if (buyPrice <= 0) missingFieldsList.push('BuyPrice');
        const isIncomplete = missingFieldsList.length > 0 ? 1 : 0;
        if (isIncomplete) draftCount += 1;
        const missingFieldsJson =
          missingFieldsList.length > 0 ? JSON.stringify(missingFieldsList) : null;
        const extraFields =
          item.extra_fields && typeof item.extra_fields === 'object' ? item.extra_fields : {};
        const extraFieldsJson =
          Object.keys(extraFields).length > 0 ? JSON.stringify(extraFields) : null;

        const nameArValue = item.nameAr || item.nameEn || item.name || nameValue;

        const [result] = await pool.execute(
          `INSERT INTO products 
         (name_en, name_ar, sku, barcode, qr_code, brand, category_id, buy_price, sell_price, stock_quantity, min_stock_level, image_url, shop_id, is_incomplete, extra_fields, missing_fields)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nameValue,
            nameArValue,
            sku || null,
            barcode || null,
            qrCode || null,
            item.brand || null,
            item.categoryId || null,
            buyPrice,
            sellPrice,
            stockQuantity,
            minStockLevel,
            item.imageUrl || null,
            shopId,
            isIncomplete,
            extraFieldsJson,
            missingFieldsJson,
          ]
        );

        const insertResult = result as any;
        imported.push({ id: insertResult.insertId, name: nameValue });
        if (nameForDedup) nameSet.add(nameForDedup);
        if (sku) skuSet.add(sku);
        if (barcode) barcodeSet.add(barcode);
        if (qrCode) qrSet.add(qrCode);
      }

      res.status(201).json({ importedCount: imported.length, draftCount, skipped, imported });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

app.get('/api/products/low-stock', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    
    let query = `
      SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.stock_quantity <= p.min_stock_level
    `;
    const params: any[] = [];
    
    if (shopId) {
      query += ' AND p.shop_id = ?';
      params.push(shopId);
    } else if (req.user.role !== 'super_admin') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    query += ' ORDER BY p.stock_quantity ASC';
    
    const [products] = await pool.execute(query, params);
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== CATEGORIES ==========
app.get('/api/categories', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    if (!shopId) {
      if (req.user?.role === 'super_admin') {
        const [categories] = await pool.execute('SELECT * FROM categories');
        return res.json(categories);
      }
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [categories] = await pool.execute(
      'SELECT * FROM categories WHERE shop_id = ? OR shop_id IS NULL ORDER BY id ASC',
      [shopId]
    );
    return res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SALES/POS ==========
app.post(
  '/api/sales',
  authenticateToken,
  requirePackageFeature('pos'),
  requireRole('super_admin', 'shop_owner', 'cashier'),
  async (req: any, res: Response) => {
  try {
    const result = await createSaleAndItems(req);
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.message === 'shopId is required') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    if (error?.message === 'Sale items required') {
      return res.status(400).json({ error: 'Sale items required' });
    }
    res.status(500).json({ error: error.message });
  }
  }
);

app.post(
  '/api/invoices',
  authenticateToken,
  requirePackageFeature('pos'),
  requireRole('super_admin', 'shop_owner', 'cashier'),
  async (req: any, res: Response) => {
  try {
    const result = await createSaleAndItems(req);
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.message === 'shopId is required') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    if (error?.message === 'Sale items required') {
      return res.status(400).json({ error: 'Sale items required' });
    }
    res.status(500).json({ error: error.message });
  }
  }
);

// Increment invoice print counter (sales row)
const incrementInvoicePrintCount = async (req: any, saleId: number) => {
  const shopId = Number(resolveShopId(req) || 0);
  if (!Number.isFinite(shopId) || shopId <= 0) {
    throw new Error('shopId is required');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.execute(
      `UPDATE sales
       SET print_count = COALESCE(print_count, 0) + 1
       WHERE id = ? AND shop_id = ?`,
      [saleId, shopId]
    );
    const updateInfo = updateResult as any;
    if (!updateInfo?.affectedRows) {
      throw new Error('Invoice not found');
    }

    const [rows] = await connection.execute(
      'SELECT id, invoice_number, print_count FROM sales WHERE id = ? AND shop_id = ?',
      [saleId, shopId]
    );
    const invoiceRow = (rows as any[])[0];

    await logAudit({
      shopId,
      userId: req.user?.id || null,
      action: 'invoice_printed',
      entityType: 'sale',
      entityId: saleId,
      details: JSON.stringify({
        invoiceNumber: invoiceRow?.invoice_number || null,
        printCount: invoiceRow?.print_count ?? null,
      }),
      ipAddress: req.ip,
    });

    await connection.commit();
    return {
      saleId: invoiceRow?.id,
      invoiceNumber: invoiceRow?.invoice_number,
      printCount: Number(invoiceRow?.print_count || 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

app.post('/api/invoices/:id/print', authenticateToken, requireRole('super_admin', 'shop_owner', 'cashier'), async (req: any, res: Response) => {
  try {
    const saleId = parseInt(req.params.id, 10);
    if (!saleId) {
      return res.status(400).json({ error: 'Invalid invoice id' });
    }
    const result = await incrementInvoicePrintCount(req, saleId);
    res.json(result);
  } catch (error: any) {
    if (error?.message === 'shopId is required') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    if (error?.message === 'Invoice not found') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Alias: sales/:id/print (same as invoices/:id/print)
app.post('/api/sales/:id/print', authenticateToken, requireRole('super_admin', 'shop_owner', 'cashier'), async (req: any, res: Response) => {
  try {
    const saleId = parseInt(req.params.id, 10);
    if (!saleId) {
      return res.status(400).json({ error: 'Invalid sale id' });
    }
    const result = await incrementInvoicePrintCount(req, saleId);
    res.json(result);
  } catch (error: any) {
    if (error?.message === 'shopId is required') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    if (error?.message === 'Invoice not found') {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales', authenticateToken, async (req: any, res: Response) => {
  try {
    const shopId = Number(resolveShopId(req) || 0);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 50;
    
    let query = `
      SELECT s.*, u.username as cashier_name,
             sh.business_name, sh.owner_name, sh.activity_type, sh.address, sh.contact_email, sh.contact_phone, sh.logo_url
      FROM sales s 
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (!shopId) {
      return res.json([]);
    }
    query += ' AND s.shop_id = ?';
    params.push(shopId);
    
    // NOTE: Some MySQL setups throw mysqld_stmt_execute errors with LIMIT placeholders.
    // To keep bindings stable, we inject a clamped numeric LIMIT directly.
    query += ` ORDER BY s.created_at DESC LIMIT ${limit}`;
    
    const [sales] = await pool.execute(query, params);
    res.json(sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices', authenticateToken, async (req: any, res: Response) => {
  try {
    const fallbackShopId = Number(req.user?.shop_id || req.user?.shopId || 1);
    const resolvedShopId = Number(resolveShopId(req) || fallbackShopId);
    const shopId = Number.isFinite(resolvedShopId) && resolvedShopId > 0 ? resolvedShopId : 1;

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 50;

    const query = `
      SELECT s.*, u.username as cashier_name,
             sh.business_name, sh.owner_name, sh.activity_type, sh.address, sh.contact_email, sh.contact_phone, sh.logo_url
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN shops sh ON s.shop_id = sh.id
      WHERE s.shop_id = ?
      ORDER BY s.created_at DESC
      LIMIT ${limit}
    `;
    const params = [shopId];
    const [sales] = await pool.execute(query, params);
    res.json(sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales/:id/items', authenticateToken, async (req: any, res: Response) => {
  try {
    const saleId = parseInt(req.params.id, 10);
    if (!saleId) {
      return res.status(400).json({ error: 'Invalid sale id' });
    }

    const shopId = Number(resolveShopId(req) || 1);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    const [sales] = await pool.execute('SELECT * FROM sales WHERE id = ? AND shop_id = ?', [saleId, shopId]);
    const saleArray = sales as any[];
    if (saleArray.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const [items] = await pool.execute(
      `SELECT si.*, p.name_en, p.name_ar, p.barcode, p.sku
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [saleId]
    );
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== VAULT (الخزنة) ==========
app.get('/api/vault/summary', authenticateToken, requireRole('super_admin', 'shop_owner', 'cashier'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) as total_out
      FROM vault_transactions
      WHERE shop_id = ?
      `,
      [shopId]
    );
    const totals = (rows as any[])[0] || { total_in: 0, total_out: 0 };
    const balance = Number(totals.total_in || 0) - Number(totals.total_out || 0);
    res.json({
      totalIn: Number(totals.total_in || 0),
      totalOut: Number(totals.total_out || 0),
      balance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vault/transactions', authenticateToken, requireRole('super_admin', 'shop_owner', 'cashier'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

    const [rows] = await pool.execute(
      `
      SELECT vt.*, u.username as created_by
      FROM vault_transactions vt
      LEFT JOIN users u ON vt.user_id = u.id
      WHERE vt.shop_id = ?
      ORDER BY vt.created_at DESC
      LIMIT ?
      `,
      [shopId, limit]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vault/transactions', authenticateToken, requireRole('super_admin', 'shop_owner', 'cashier'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const { type, amount, reason, notes, relatedSaleId } = req.body;
    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const [result] = await pool.execute(
      `INSERT INTO vault_transactions (shop_id, user_id, type, amount, reason, notes, related_sale_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        req.user?.id || null,
        type,
        numericAmount,
        reason || null,
        notes || null,
        relatedSaleId || null,
      ]
    );
    const insertResult = result as any;

    await logAudit({
      shopId,
      userId: req.user?.id || null,
      action: 'vault_transaction_created',
      entityType: 'vault_transaction',
      entityId: insertResult.insertId,
      details: JSON.stringify({ type, amount: numericAmount, reason }),
      ipAddress: req.ip,
    });

    res.status(201).json({ id: insertResult.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== AUDIT LOGS (المراجع) ==========
app.get('/api/audit-logs', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

    const [rows] = await pool.execute(
      `
      SELECT al.*, u.username as actor
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.shop_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
      `,
      [shopId, limit]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audit-logs', authenticateToken, requireRole('super_admin', 'shop_owner'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    const { action, entityType, entityId, details } = req.body;
    if (!action || !entityType) {
      return res.status(400).json({ error: 'action and entityType are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO audit_logs (shop_id, user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        shopId,
        req.user?.id || null,
        action,
        entityType,
        entityId || null,
        details ? String(details) : null,
        req.ip,
      ]
    );
    const insertResult = result as any;

    res.status(201).json({ id: insertResult.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== DASHBOARD STATISTICS ==========
app.get('/api/dashboard/stats', authenticateToken, requirePackageFeature('dashboard'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    
    if (shopId) {
      whereClause += ' AND s.shop_id = ?';
      params.push(shopId);
    } else if (req.user.role !== 'super_admin') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    // Monthly revenue
    const [revenue] = await pool.execute(`
      SELECT COALESCE(SUM(total_amount), 0) as monthly_revenue 
      FROM sales s 
      ${whereClause}
      AND MONTH(s.created_at) = MONTH(CURRENT_DATE())
      AND YEAR(s.created_at) = YEAR(CURRENT_DATE())
    `, params);
    
    // Total products
    let productQuery = 'SELECT COUNT(*) as total_products FROM products';
    const productParams: any[] = [];
    if (shopId) {
      productQuery += ' WHERE shop_id = ?';
      productParams.push(shopId);
    }
    const [products] = await pool.execute(productQuery, productParams);
    
    // Low stock count
    let lowStockQuery = 'SELECT COUNT(*) as low_stock_count FROM products WHERE stock_quantity <= min_stock_level';
    const lowStockParams: any[] = [];
    if (shopId) {
      lowStockQuery += ' AND shop_id = ?';
      lowStockParams.push(shopId);
    }
    const [lowStock] = await pool.execute(lowStockQuery, lowStockParams);
    
    res.json({
      monthlyRevenue: (revenue as any[])[0]?.monthly_revenue || 0,
      totalProducts: (products as any[])[0]?.total_products || 0,
      lowStockCount: (lowStock as any[])[0]?.low_stock_count || 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/sales-chart', authenticateToken, requirePackageFeature('dashboard'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    const days = parseInt(req.query.days as string) || 30;
    
    let whereClause = '';
    const params: any[] = [days];
    
    if (shopId) {
      whereClause = 'AND s.shop_id = ?';
      params.push(shopId);
    } else if (req.user.role !== 'super_admin') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    const [chartData] = await pool.execute(`
      SELECT 
        DATE(s.created_at) as date,
        SUM(s.total_amount) as revenue,
        COUNT(s.id) as transactions
      FROM sales s
      WHERE s.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
      ${whereClause}
      GROUP BY DATE(s.created_at)
      ORDER BY date ASC
    `, params);
    
    res.json(chartData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/profit-chart', authenticateToken, requirePackageFeature('dashboard'), async (req: any, res: Response) => {
  try {
    const shopId = resolveShopId(req);
    const days = parseInt(req.query.days as string) || 30;
    
    let whereClause = '';
    const params: any[] = [days];
    
    if (shopId) {
      whereClause = 'AND s.shop_id = ?';
      params.push(shopId);
    } else if (req.user.role !== 'super_admin') {
      return res.status(400).json({ error: 'shopId is required' });
    }
    
    const [profitData] = await pool.execute(`
      SELECT 
        DATE(s.created_at) as date,
        SUM(s.total_amount) as revenue,
        SUM((si.unit_price - p.buy_price) * si.quantity) as profit
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      JOIN products p ON si.product_id = p.id
      WHERE s.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
      ${whereClause}
      GROUP BY DATE(s.created_at)
      ORDER BY date ASC
    `, params);
    
    res.json(profitData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== PUBLIC STOREFRONT (Gold package only) ==========
// Resolve shop by the HTTP Host header (custom domains)
app.get('/api/public/storefront/preview/:shopSlug', async (req: Request, res: Response) => {
  try {
    const raw = String((req as any).params?.shopSlug || '').trim();
    const normalized = raw.trim().replace(/\s+/g, '-');
    const idPart = normalized.split('-')[0];
    const shopId = parseInt(idPart, 10);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'Invalid shop slug' });
    }

    const [shops] = await pool.execute('SELECT * FROM shops WHERE id = ?', [shopId]);
    const shopArray = shops as any[];
    if (shopArray.length === 0) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    const [categories] = await pool.execute(
      'SELECT * FROM categories WHERE shop_id = ? OR shop_id IS NULL ORDER BY id ASC',
      [shopId]
    );

    const [products] = await pool.execute(
      `
      SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.shop_id = ?
      ORDER BY p.created_at DESC
      `,
      [shopId]
    );

    return res.json({
      preview: true,
      shop: shopArray[0],
      categories,
      products,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/public/storefront', resolveShopByDomainHost, async (req: any, res: Response) => {
  try {
    const shopId = Number(req.shopId || 0);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    // Enforce Gold package for storefront publishing
    const [shops] = await pool.execute('SELECT * FROM shops WHERE id = ? AND package = "gold"', [shopId]);
    const shopArray = shops as any[];
    if (shopArray.length === 0) {
      return res.status(404).json({ error: 'Storefront not available' });
    }

    const [categories] = await pool.execute(
      'SELECT * FROM categories WHERE shop_id = ? OR shop_id IS NULL ORDER BY id ASC',
      [shopId]
    );

    const [products] = await pool.execute(
      `
      SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.shop_id = ?
      ORDER BY p.created_at DESC
      `,
      [shopId]
    );

    return res.json({
      domain: req.resolvedDomain || null,
      shop: shopArray[0],
      categories,
      products,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/public/storefront/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    
    // Check if shop has Gold package
    const [shops] = await pool.execute('SELECT * FROM shops WHERE id = ? AND package = "gold"', [shopId]);
    const shopArray = shops as any[];
    
    if (shopArray.length === 0) {
      return res.status(404).json({ error: 'Storefront not available' });
    }
    
    const [products] = await pool.execute(`
      SELECT p.*, c.name_en as category_name_en, c.name_ar as category_name_ar 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.shop_id = ? AND p.stock_quantity > 0
      ORDER BY p.created_at DESC
    `, [shopId]);
    
    res.json({
      shop: shopArray[0],
      products
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  // Handle invalid JSON body (Express json parser)
  if (err instanceof SyntaxError && (err as any)?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error('❌ Unhandled API error:', err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});
