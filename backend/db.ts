import mysql from 'mysql2/promise';
import crypto from 'crypto';

function generatePublicCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// DB_MODE: tcp = local (127.0.0.1), socket = Cloud Run (/cloudsql/INSTANCE_CONNECTION_NAME)
const DB_MODE = (process.env.DB_MODE || 'tcp').toLowerCase();
const DB_USER = process.env.DB_USER || 'crown_app';
const DB_PASS = process.env.DB_PASS || process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'crown_services';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const INSTANCE_CONNECTION_NAME = process.env.INSTANCE_CONNECTION_NAME || '';

const useSocket = DB_MODE === 'socket' && !!INSTANCE_CONNECTION_NAME;

const dbConfig = useSocket
  ? {
      socketPath: `/cloudsql/${INSTANCE_CONNECTION_NAME}`,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    }
  : {
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };

if (process.env.NODE_ENV !== 'test') {
  console.log(`DB mode: ${useSocket ? 'socket' : 'tcp'} (DB_MODE=${DB_MODE})`);
}

export const pool = mysql.createPool(dbConfig);

async function ensureDatabaseExists() {
  try {
    const { database, ...base } = dbConfig as any;
    const conn = await mysql.createConnection({ ...base, database: undefined });
    try {
      await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    } finally {
      await conn.end();
    }
  } catch (e: any) {
    if (!useSocket) throw e;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await ensureDatabaseExists();
    const conn = await pool.getConnection();
    conn.release();
    console.log('✅ DB connected');
    return true;
  } catch (error: any) {
    console.error('❌ DB connection error:', error?.message || error);
    if (error?.code) console.error('   Code:', error.code);
    if (error?.errno) console.error('   Errno:', error.errno);
    return false;
  }
}

// Initialize database tables
export async function initializeDatabase() {
  try {
    // Users table with RBAC roles (email only, no username)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'shop_owner', 'cashier', 'warehouse') DEFAULT 'cashier',
        package ENUM('bronze', 'silver', 'gold') DEFAULT 'bronze',
        shop_id INT NULL,
        employee_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_shop_id (shop_id),
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const userMigrations = [
      () => pool.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL'),
      () => pool.execute('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL'),
      () => pool.execute('ALTER TABLE users ADD COLUMN employee_id VARCHAR(64) NULL'),
    ];
    for (const fn of userMigrations) {
      try { await fn(); } catch (e: any) { if (e?.code !== 'ER_DUP_FIELDNAME') throw e; }
    }

    // Ensure role enum includes warehouse (for existing schemas)
    await pool.execute(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('super_admin', 'shop_owner', 'cashier', 'warehouse') DEFAULT 'cashier';
    `);

    // Shops table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS shops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        business_name VARCHAR(255) NULL,
        owner_name VARCHAR(255) NULL,
        activity_type VARCHAR(255) NULL,
        address TEXT NULL,
        contact_email VARCHAR(255) NULL,
        contact_phone VARCHAR(64) NULL,
        country_name VARCHAR(255) NULL,
        currency_code VARCHAR(16) NULL,
        currency_symbol VARCHAR(16) NULL,
        plan_type VARCHAR(32) NULL,
        is_active TINYINT(1) DEFAULT 0,
        trial_ends_at TIMESTAMP NULL,
        logo_url TEXT NULL,
        owner_id INT NOT NULL,
        package ENUM('bronze', 'silver', 'gold') DEFAULT 'bronze',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner_id (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Custom domains table (multi-tenant storefront resolution by Host header)
    // - One domain maps to one shop_id (UNIQUE domain)
    // - Allowed TLDs: .com, .net, .org, .shop, .store (enforced by CHECK + app validation)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS domains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        domain VARCHAR(253) NOT NULL,
        status ENUM('pending', 'verified', 'active', 'inactive') DEFAULT 'pending',
        is_active TINYINT(1) DEFAULT 0,
        verification_method ENUM('txt', 'cname') DEFAULT 'txt',
        verification_token CHAR(64) NOT NULL,
        verified_at TIMESTAMP NULL,
        activated_at TIMESTAMP NULL,
        deactivated_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_domains_shop_id FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        CONSTRAINT uq_domains_domain UNIQUE (domain),
        CONSTRAINT ck_domains_domain_lower CHECK (domain = LOWER(domain)),
        CONSTRAINT ck_domains_allowed_tld CHECK (SUBSTRING_INDEX(domain, '.', -1) IN ('com', 'net', 'org', 'shop', 'store')),
        CONSTRAINT ck_domains_domain_format CHECK (
          domain REGEXP '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(com|net|org|shop|store)$'
        ),
        INDEX idx_domains_shop_id (shop_id),
        INDEX idx_domains_resolution (domain, is_active, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Domains migrations for existing schemas (safe adds)
    const domainColumns: Array<{ name: string; definition: string }> = [
      { name: 'status', definition: `ENUM('pending', 'verified', 'active', 'inactive') DEFAULT 'pending'` },
      { name: 'is_active', definition: 'TINYINT(1) DEFAULT 0' },
      { name: 'verification_method', definition: `ENUM('txt', 'cname') DEFAULT 'txt'` },
      // NOTE: added nullable for migration safety; we backfill + tighten below
      { name: 'verification_token', definition: 'CHAR(64) NULL' },
      { name: 'verified_at', definition: 'TIMESTAMP NULL' },
      { name: 'activated_at', definition: 'TIMESTAMP NULL' },
      { name: 'deactivated_at', definition: 'TIMESTAMP NULL' },
    ];

    for (const column of domainColumns) {
      try {
        await pool.execute(`ALTER TABLE domains ADD COLUMN ${column.name} ${column.definition};`);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_FIELDNAME' && error?.code !== 'ER_NO_SUCH_TABLE') {
          throw error;
        }
      }
    }

    // Backfill missing verification tokens (if table existed before this migration)
    try {
      const [rows] = await pool.execute(
        `SELECT id FROM domains WHERE verification_token IS NULL OR verification_token = ''`
      );
      for (const row of rows as any[]) {
        const token = crypto.randomBytes(32).toString('hex');
        await pool.execute('UPDATE domains SET verification_token = ? WHERE id = ?', [token, row.id]);
      }
      try {
        await pool.execute('ALTER TABLE domains MODIFY COLUMN verification_token CHAR(64) NOT NULL');
      } catch (error: any) {
        // Ignore if already NOT NULL or table missing
        if (error?.code !== 'ER_NO_SUCH_TABLE') {
          // Some MySQL setups might reject this if constraints differ; keep it best-effort.
        }
      }
    } catch (error: any) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') {
        throw error;
      }
    }

    try {
      await pool.execute('CREATE UNIQUE INDEX uq_domains_domain ON domains (domain)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        // Ignore missing table as it will be created above
        if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      }
    }

    try {
      await pool.execute('CREATE INDEX idx_domains_resolution ON domains (domain, is_active, status)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
      }
    }

    // Categories table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name_en VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        shop_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shop_id (shop_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Products/Inventory table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name_en VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        sku VARCHAR(128) NULL,
        barcode VARCHAR(128) NULL,
        qr_code VARCHAR(255) NULL,
        brand VARCHAR(255),
        category_id INT,
        buy_price DECIMAL(10, 2) NOT NULL,
        sell_price DECIMAL(10, 2) NOT NULL,
        stock_quantity INT DEFAULT 0,
        min_stock_level INT DEFAULT 5,
        image_url TEXT NULL,
        shop_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        INDEX idx_shop_id (shop_id),
        INDEX idx_category_id (category_id),
        INDEX idx_sku (sku),
        INDEX idx_barcode (barcode),
        INDEX idx_qr_code (qr_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Sales/Transactions table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        user_id INT NULL,
        invoice_number VARCHAR(32) UNIQUE NULL,
        customer_name VARCHAR(255) NULL,
        customer_phone VARCHAR(64) NULL,
        customer_address TEXT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('cash', 'card', 'other', 'invoice') DEFAULT 'cash',
        print_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_shop_id (shop_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.execute(`
      ALTER TABLE sales
      MODIFY COLUMN user_id INT NULL;
    `);

    try {
      await pool.execute(`ALTER TABLE products ADD COLUMN image_url TEXT NULL;`);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    const shopColumns: Array<{ name: string; definition: string }> = [
      { name: 'business_name', definition: 'VARCHAR(255) NULL' },
      { name: 'owner_name', definition: 'VARCHAR(255) NULL' },
      { name: 'activity_type', definition: 'VARCHAR(255) NULL' },
      { name: 'address', definition: 'TEXT NULL' },
      { name: 'contact_email', definition: 'VARCHAR(255) NULL' },
      { name: 'contact_phone', definition: 'VARCHAR(64) NULL' },
      { name: 'logo_url', definition: 'TEXT NULL' },
      { name: 'country_name', definition: 'VARCHAR(255) NULL' },
      { name: 'currency_code', definition: 'VARCHAR(16) NULL' },
      { name: 'currency_symbol', definition: 'VARCHAR(16) NULL' },
      { name: 'plan_type', definition: 'VARCHAR(32) NULL' },
      { name: 'is_active', definition: 'TINYINT(1) DEFAULT 0' },
      { name: 'trial_ends_at', definition: 'TIMESTAMP NULL' },
    ];

    for (const column of shopColumns) {
      try {
        await pool.execute(`ALTER TABLE shops ADD COLUMN ${column.name} ${column.definition};`);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }
    }

    try {
      await pool.execute('ALTER TABLE shops MODIFY COLUMN logo_url LONGTEXT');
    } catch (error: any) {
      if (error?.code !== 'ER_BAD_FIELD_ERROR') {
        throw error;
      }
    }

    const productColumns: Array<{ name: string; definition: string }> = [
      { name: 'sku', definition: 'VARCHAR(128) NULL' },
      { name: 'barcode', definition: 'VARCHAR(128) NULL' },
      { name: 'qr_code', definition: 'VARCHAR(255) NULL' },
    ];

    for (const column of productColumns) {
      try {
        await pool.execute(`ALTER TABLE products ADD COLUMN ${column.name} ${column.definition};`);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }
    }

    try {
      await pool.execute('CREATE INDEX idx_sku ON products (sku)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }

    try {
      await pool.execute('CREATE INDEX idx_barcode ON products (barcode)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }

    try {
      await pool.execute('CREATE INDEX idx_qr_code ON products (qr_code)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }

    try {
      await pool.execute('ALTER TABLE products ADD COLUMN import_batch_id INT NULL');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }
    try {
      await pool.execute('CREATE INDEX idx_products_import_batch ON products (import_batch_id)');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }

    const salesColumns: Array<{ name: string; definition: string }> = [
      { name: 'customer_name', definition: 'VARCHAR(255) NULL' },
      { name: 'customer_phone', definition: 'VARCHAR(64) NULL' },
      { name: 'customer_address', definition: 'TEXT NULL' },
    ];

    for (const column of salesColumns) {
      try {
        await pool.execute(`ALTER TABLE sales ADD COLUMN ${column.name} ${column.definition};`);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_FIELDNAME') {
          throw error;
        }
      }
    }

    // Invoice print counter (for existing schemas)
    try {
      await pool.execute('ALTER TABLE sales ADD COLUMN print_count INT DEFAULT 0;');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    // Password resets table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      await pool.execute(`ALTER TABLE sales ADD COLUMN invoice_number VARCHAR(32) UNIQUE NULL;`);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    await pool.execute(`
      ALTER TABLE sales
      MODIFY COLUMN payment_method ENUM('cash', 'card', 'other', 'invoice') DEFAULT 'cash';
    `);

    // Sale items table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_sale_id (sale_id),
        INDEX idx_product_id (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Invoices view (alias for sales)
    await pool.execute(`CREATE OR REPLACE VIEW invoices AS SELECT * FROM sales;`);

    // Vault transactions (الخزنة)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS vault_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        user_id INT NULL,
        type ENUM('in', 'out') NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        reason VARCHAR(255) NULL,
        notes TEXT NULL,
        related_sale_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (related_sale_id) REFERENCES sales(id) ON DELETE SET NULL,
        INDEX idx_vault_shop_id (shop_id),
        INDEX idx_vault_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Audit logs (المراجع)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        user_id INT NULL,
        action VARCHAR(128) NOT NULL,
        entity_type VARCHAR(128) NOT NULL,
        entity_id INT NULL,
        details TEXT NULL,
        ip_address VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_audit_shop_id (shop_id),
        INDEX idx_audit_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Licenses table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        license_key VARCHAR(128) UNIQUE NOT NULL,
        plan ENUM('bronze', 'silver', 'gold') NOT NULL,
        duration ENUM('monthly', 'quarterly', 'yearly', 'lifetime') NOT NULL,
        status ENUM('unused', 'active', 'expired') DEFAULT 'unused',
        used_by_user_id INT NULL,
        used_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_license_key (license_key),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Import staging: batches and rows
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        shop_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        status ENUM('pending', 'partial', 'committed') DEFAULT 'pending',
        imported_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        rolled_back_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        INDEX idx_import_batch_shop (shop_id),
        INDEX idx_import_batch_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      await pool.execute('ALTER TABLE import_batches ADD COLUMN rolled_back_at TIMESTAMP NULL');
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS import_batch_rows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id INT NOT NULL,
        row_index INT NOT NULL,
        raw_data JSON,
        mapped_data JSON,
        errors JSON,
        status ENUM('pending', 'valid', 'invalid', 'imported', 'fixed') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
        INDEX idx_import_row_batch (batch_id),
        INDEX idx_import_row_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Insert default categories if they don't exist
    await pool.execute(`
      INSERT IGNORE INTO categories (name_en, name_ar) VALUES
      ('Oil', 'زيت'),
      ('Tires', 'إطارات'),
      ('Batteries', 'بطاريات');
    `);

    // Online orders (storefront) - spec schema
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS online_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'pending',
        customer_name VARCHAR(255) NOT NULL,
        phone VARCHAR(64) NOT NULL,
        governorate VARCHAR(128) NOT NULL,
        city VARCHAR(128) NOT NULL,
        address TEXT NOT NULL,
        notes TEXT NULL,
        payment_method VARCHAR(50) NULL,
        subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
        total DECIMAL(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(8) DEFAULT 'EGP',
        source VARCHAR(32) DEFAULT 'online',
        public_code VARCHAR(16) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        INDEX idx_online_orders_shop (shop_id),
        INDEX idx_online_orders_status (status),
        INDEX idx_online_orders_public_code (public_code),
        INDEX idx_online_orders_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS online_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        name_snapshot VARCHAR(255) NULL,
        sku_snapshot VARCHAR(128) NULL,
        barcode_snapshot VARCHAR(128) NULL,
        sell_price_snapshot DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        FOREIGN KEY (order_id) REFERENCES online_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
        INDEX idx_online_order_items_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Extend sales for online invoices
    const salesExtensions: Array<{ name: string; definition: string }> = [
      { name: 'source', definition: "VARCHAR(16) DEFAULT 'pos'" },
      { name: 'online_order_id', definition: 'INT NULL' },
      { name: 'last_printed_at', definition: 'TIMESTAMP NULL' },
      { name: 'invoice_serial', definition: 'VARCHAR(64) NULL' },
    ];
    for (const col of salesExtensions) {
      try {
        await pool.execute(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.definition};`);
      } catch (err: any) {
        if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
      }
    }
    try {
      await pool.execute('CREATE UNIQUE INDEX idx_sales_invoice_serial ON sales(invoice_serial);');
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_KEYNAME' && err?.code !== 'ER_MULTIPLE_PRI_KEY') {
        // column may not exist or index already exists
      }
    }

    // Dedicated online invoices (separate from POS sales)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS online_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        order_id INT NOT NULL UNIQUE,
        invoice_number INT NOT NULL,
        total DECIMAL(12, 2) NOT NULL DEFAULT 0,
        printed_count INT DEFAULT 0,
        last_printed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES online_orders(id) ON DELETE CASCADE,
        INDEX idx_online_invoices_shop (shop_id),
        INDEX idx_online_invoices_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS online_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        product_id INT NULL,
        name_snapshot VARCHAR(255) NULL,
        sku_snapshot VARCHAR(128) NULL,
        price_snapshot DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        FOREIGN KEY (invoice_id) REFERENCES online_invoices(id) ON DELETE CASCADE,
        INDEX idx_online_invoice_items_invoice (invoice_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add public_code to existing online_orders if missing
    try {
      await pool.execute('ALTER TABLE online_orders ADD COLUMN public_code VARCHAR(16) NULL');
    } catch (err: any) {
      if (err?.code !== 'ER_DUP_FIELDNAME') {
        // ignore
      }
    }
    try {
      const [rows] = await pool.execute("SELECT id FROM online_orders WHERE public_code IS NULL OR public_code = ''");
      for (const r of rows as any[]) {
        const code = generatePublicCode();
        await pool.execute('UPDATE online_orders SET public_code = ? WHERE id = ?', [code, r.id]);
      }
    } catch {
      // best effort backfill
    }

    // Notifications (activity log: online + pos + system) - persistent forever
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id BIGINT NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'online',
        type VARCHAR(64) NOT NULL DEFAULT 'online_order_created',
        title_ar VARCHAR(255) NOT NULL DEFAULT '',
        title_en VARCHAR(255) NOT NULL DEFAULT '',
        body_ar TEXT NOT NULL,
        body_en TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        meta JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        INDEX idx_notifications_shop_created (shop_id, created_at DESC),
        INDEX idx_notifications_shop_read (shop_id, is_read),
        INDEX idx_notifications_shop_source_created (shop_id, source, created_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    // Safe migrations for existing tables
    try {
      await pool.execute('ALTER TABLE notifications ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT \'online\' AFTER shop_id');
    } catch (m: any) {
      if (!String(m?.message || m).includes('Duplicate column')) console.error('notifications.source:', m?.message || m);
    }
    try {
      await pool.execute('CREATE INDEX idx_notifications_shop_source_created ON notifications (shop_id, source, created_at DESC)');
    } catch (m: any) {
      if (!String(m?.message || m).includes('Duplicate')) console.error('notifications.idx_shop_source_created:', m?.message || m);
    }

    // Stock reservations for online orders (prevent overselling)
    // shop_id, order_id, product_id must match shops.id, online_orders.id, products.id (all INT)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        shop_id INT NOT NULL,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        qty INT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'reserved',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES online_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_reservations_order (order_id),
        INDEX idx_reservations_shop_status (shop_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migration: if stock_reservations existed with BIGINT (FK incompatible), drop and recreate
    try {
      const [cols] = await pool.execute(
        `SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_reservations' AND COLUMN_NAME = 'shop_id'`
      );
      const row = (cols as any[])[0];
      if (row && String(row.DATA_TYPE || '').toLowerCase() === 'bigint') {
        await pool.execute(`DROP TABLE IF EXISTS stock_reservations`);
        await pool.execute(`
          CREATE TABLE stock_reservations (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            shop_id INT NOT NULL,
            order_id INT NOT NULL,
            product_id INT NOT NULL,
            qty INT NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'reserved',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES online_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            INDEX idx_reservations_order (order_id),
            INDEX idx_reservations_shop_status (shop_id, status)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      }
    } catch (_) {
      /* ignore migration errors */
    }

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}
