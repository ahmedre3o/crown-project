# Crown Services ERP System

A comprehensive SaaS ERP system for auto parts and services management with multi-language support, RBAC, subscription management, and AI assistant.

## Features

### ✅ Complete RBAC (Role-Based Access Control)
- **Super Admin**: Manage all shops, users, and system settings
- **Shop Owner**: Manage inventory, staff, and shop operations
- **Cashier**: Access to POS (Point of Sale) only

### ✅ Multi-Language Support
- Full UI support for **Arabic (RTL)** and **English (LTR)**
- Language switcher in the top-right corner
- All menus, charts, and dashboard elements are fully translated

### ✅ Subscription Management
- **Bronze Package**: Basic features, limited users
- **Silver Package**: Enhanced features, more users
- **Gold Package**: Full features including public storefront

### ✅ Database Connection
- Connected to Google Cloud SQL: `crown-services-last-project-db`
- Credentials: `root` / `crown2026`
- Automatic table initialization on startup

### ✅ POS & Invoices
- Complete POS screen with categories (Oil, Tires, Batteries)
- Real-time cart management
- High-end neon-styled receipt printing
- Cash payment processing

### ✅ Dashboard
- Sales analytics charts (Line & Bar charts)
- Profit analytics
- Low stock alerts section
- Real-time statistics

### ✅ AI Assistant
- Floating Gemini AI Assistant
- API Key: `AIzaSyD3zXRza2kSUTyT34SRvf_hPCx6SDK3F3E`
- Cyberpunk-styled chat interface

### ✅ Public Storefront (Gold Package)
- Public-facing online store for Gold package shops
- Accessible at `/storefront/:shopId`
- Product catalog with shopping cart

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- MySQL database (Google Cloud SQL)
- TypeScript

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Backend dependencies:**
```bash
cd backend
npm install bcryptjs jsonwebtoken @types/bcryptjs @types/jsonwebtoken
```

3. **Frontend dependencies:**
```bash
cd frontend
npm install react-router-dom
```

### Database Configuration

Update `backend/.env` with your Google Cloud SQL connection details:
```env
DB_HOST=your-cloud-sql-ip
DB_PORT=3306
DB_USER=root
DB_PASSWORD=crown2026
DB_NAME=crown-services-last-project-db
DB_SSL=false
JWT_SECRET=crown-services-secret-key-2026
GEMINI_API_KEY=AIzaSyD3zXRza2kSUTyT34SRvf_hPCx6SDK3F3E
```

### Environment (Frontend)

Copy `env.example` to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL`:
- **Local backend:** `http://localhost:5001`
- **Cloud Run backend:** `https://crown-api-756273570281.us-central1.run.app`

**Important:** Restart the dev server (`npm run dev`) after changing `.env.local` — Next.js reads env vars at startup.

### Running the Application

1. **Start Backend:**
```bash
npm run backend:dev
```
Backend runs on `http://localhost:5001`

2. **Start Frontend (Next.js):**
```bash
npm run dev
```
Frontend runs on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Products & Inventory
- `GET /api/products` - Get all products
- `POST /api/products` - Create product (Shop Owner/Super Admin)
- `GET /api/products/low-stock` - Get low stock alerts

### Sales & POS
- `POST /api/sales` - Create new sale
- `GET /api/sales` - Get sales history

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/sales-chart` - Get sales chart data
- `GET /api/dashboard/profit-chart` - Get profit chart data

### Public Storefront
- `GET /api/public/storefront/:shopId` - Get storefront data (Gold package only)

### AI Assistant
- `POST /api/chat` - Chat with Gemini AI

## Default Categories

The system automatically creates these categories:
- Oil (زيت)
- Tires (إطارات)
- Batteries (بطاريات)

## User Roles & Permissions

| Role | Permissions |
|------|------------|
| Super Admin | All permissions, manage all shops |
| Shop Owner | Manage own shop, inventory, staff |
| Cashier | POS access only |

## Package Features

| Package | Features |
|---------|----------|
| Bronze | Basic POS, limited users |
| Silver | Enhanced features, more users |
| Gold | Full features + Public storefront |

## Technologies Used

- **Backend**: Express.js, TypeScript, MySQL2
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Charts**: Recharts
- **AI**: Google Gemini API
- **Authentication**: JWT, bcryptjs

## End-to-End Test: Notifications & Activity

1. **Start app:** `npm run dev:all` (backend :5001, frontend :3000)
2. **Create an online order:**
   - Open `/storefront?shopId=1` (or `/storefront?preview=1-shop`)
   - Add products to cart, click "Order Now", fill checkout form, submit
   - Check bell icon: unread badge should appear; dropdown shows "New online order"
3. **Create a POS sale:**
   - Log in as shop_owner/cashier, go to `/pos`
   - Add products to cart, complete sale
   - Check bell: new "New POS sale" notification
4. **View full activity:** Click "View all notifications" → `/store-admin/notifications`
   - Filters: All / Online / POS / System
   - Search, mark all read, load more (pagination)
5. **Track order & Back to Store:**
   - After placing online order, click "Track Order" → `/track?code=...&phone=...`
   - Click "Back to Store" → should land on working storefront (no Unknown domain)

## Notes

- The database connection uses Google Cloud SQL. Make sure your IP is whitelisted.
- The AI Assistant uses the provided Gemini API key.
- All passwords should be hashed in production (currently using bcryptjs).
- The receipt printing opens a new window with styled HTML for printing.

## License

Private - Crown Services
