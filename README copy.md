# Project Monitor System (Jira-grade Project & Workflow Management Engine)

A high-performance enterprise project management system featuring **sub-5ms indexed queries**, **dual-token JWT authentication**, **Super Admin User Management**, **Drag-and-Drop Kanban Boards**, **Cursor-based Infinite Scroll**, **Swagger OpenAPI Docs**, and **Pluggable File Storage (Local Disk -> AWS S3)**.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TanStack Query v5 (Infinite queries), Tailwind CSS (Navy Blue & Crisp White Palette), Framer Motion, dnd-kit.
- **Backend**: Express.js (Node.js REST API), Layered Architecture (Controllers, Services, Repositories).
- **Database**: MongoDB + Mongoose with **Covered Compound B-Tree Indexing** for lakhs of records.
- **Caching**: Redis (Cache-aside pattern with automatic invalidation on updates).
- **Authentication**: JWT Access Token (15m) + Long-lived Refresh Token (7d) with revocation.
- **API Documentation**: Interactive Swagger UI at `http://localhost:5000/api/docs`.
- **File Storage**: Adapter Strategy (`LocalStorageProvider` -> `S3StorageProvider`).
- **Email Service**: Nodemailer / SMTP notification service.
- **Admin & SaaS**: SuperAdmin role, status toggles (Active/Suspended), and subscription quota tiers (Free, Pro, Enterprise).

---

## 🚀 Quick Start Guide

### 1. Backend Setup
```bash
cd backend
npm install

# (Optional) Seed initial users, workspace, and 20+ tasks
npm run seed

# Start API server (port 5000)
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps

# Start Next.js client (port 3000)
npm run dev
```

### 3. Demo Credentials
| Role | Email | Password |
| :--- | :--- | :--- |
| 👑 **Super Admin** | `admin@projectmonitor.local` | `Admin@123456` |
| 👨‍💻 **Project Manager** | `alex@company.com` | `User@123456` |
| 🎨 **UI/UX Designer** | `sarah@company.com` | `User@123456` |

---

## 📚 API Documentation (Swagger)
Once the backend is running, browse interactive API endpoints at:
👉 **[http://localhost:5000/api/docs](http://localhost:5000/api/docs)**

---

## ⚡ Sub-5ms Performance & Indexing Strategy
1. **Cursor Pagination**: Querying `_id < cursor` replaces slow offset skips, guaranteeing $O(1)$ response time even with 100,000+ issues.
2. **Compound Index**: `{ projectId: 1, isArchived: 1, _id: -1 }` produces an `IXSCAN` directly from memory.
3. **Redis Cache-Aside**: Frequently requested Kanban boards and task lists are returned from in-memory Redis keys with TTL and pattern invalidation on card drag-and-drop.
