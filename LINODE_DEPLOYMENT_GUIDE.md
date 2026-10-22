# 🚀 Linode & Docker Production Deployment Guide

This guide walks you through deploying the **Project Monitor System** to a **Linode Compute Instance** (Ubuntu 22.04 / 24.04 LTS) using Docker & Docker Compose.

---

## 1. Prerequisites on Linode

1. **Create a Linode Instance**:
   - OS: Ubuntu 22.04 LTS or 24.04 LTS
   - Plan: Shared CPU 2GB or 4GB RAM recommended (Nanode 1GB can work with 2GB swap)
   - Note down your **Linode Public IP** (e.g., `172.105.x.x`).

2. **SSH into your Linode Server**:
   ```bash
   ssh root@<YOUR_LINODE_IP>
   ```

3. **Install Docker & Docker Compose Plugin**:
   ```bash
   # Update packages
   sudo apt-get update && sudo apt-get upgrade -y

   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh

   # Verify Docker & Compose
   docker --version
   docker compose version
   ```

---

## 2. Clone & Setup the Repository

1. **Clone your repository**:
   ```bash
   git clone <YOUR_GIT_REPOSITORY_URL> /opt/project-monitor
   cd /opt/project-monitor
   ```

2. **Configure Production Environment Files**:
   - Backend config:
     ```bash
     cp backend/.env.example backend/.env.production
     nano backend/.env.production
     ```
     Ensure `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `SMTP` credentials are populated.

   - Root Docker config:
     ```bash
     cp .env.example .env
     nano .env
     ```
     Set:
     ```ini
     NEXT_PUBLIC_API_URL=http://<YOUR_LINODE_IP>:5000/api/v1
     NEXT_PUBLIC_SOCKET_URL=http://<YOUR_LINODE_IP>:5000
     ```

---

## 3. Launch with Docker Compose

To build and run all containers in background mode:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Check Container Status:
```bash
docker compose -f docker-compose.prod.yml ps
```

### View Live Logs:
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Backend only
docker compose -f docker-compose.prod.yml logs -f backend

# Frontend only
docker compose -f docker-compose.prod.yml logs -f frontend
```

---

## 4. Accessing Your Application

Once the containers are running:
- 🌐 **Frontend Web App**: `http://<YOUR_LINODE_IP>:3000`
- 📡 **Backend API**: `http://<YOUR_LINODE_IP>:5000/api/v1/health`
- 📚 **Swagger Docs**: `http://<YOUR_LINODE_IP>:5000/api/docs`

---

## 5. Helpful Maintenance Commands

| Task | Command |
| :--- | :--- |
| **Stop Stack** | `docker compose -f docker-compose.prod.yml down` |
| **Restart Stack** | `docker compose -f docker-compose.prod.yml restart` |
| **Rebuild After Code Pull** | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| **View Resource Usage** | `docker stats` |
| **View Redis Status** | `docker exec -it pms-prod-redis redis-cli ping` |

---

## 6. Optional: Setup Nginx Reverse Proxy with Free SSL (Let's Encrypt)

If you have a domain name pointed to your Linode IP (e.g. `pms.yourcompany.com`):

```bash
sudo apt-get install nginx certbot python3-certbot-nginx -y
```

Nginx configuration (`/etc/nginx/sites-available/pms`):
```nginx
server {
    server_name pms.yourcompany.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable & obtain SSL:
```bash
sudo ln -s /etc/nginx/sites-available/pms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pms.yourcompany.com
```
