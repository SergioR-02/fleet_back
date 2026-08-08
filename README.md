# FleetExpense Backend

API REST para gestión de conductores y gastos de flota.

## Stack

- NestJS + TypeScript
- Prisma ORM
- PostgreSQL (schemas: `auth`, `fleet`, `expenses`, `audit`)
- JWT (panel admin / conductor)
- API Key (`X-API-Key`) para n8n
- Swagger/OpenAPI

## Principio de persistencia

Solo se almacena información **definitiva**. No hay tablas de OCR, extracciones temporales ni recibos.

- Gasto se crea tras confirmación del conductor (vía n8n) o alta admin
- Estado interno: `PENDING_REVIEW` → `REVIEWED` | `REJECTED`
- Duplicados: `POST /api/expenses` devuelve **409** si hay match; reenviar con `force: true`

## Arranque rápido (Docker completo)

```bash
cp .env.example .env
docker compose up -d --build
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/docs
- Postgres (host): `localhost:5433` (mapeado al 5432 del contenedor)

> En desarrollo local el host usa el **puerto 5433** para no chocar con un Postgres instalado en 5432.

## Desarrollo local

```bash
# 1. Postgres
docker compose up -d postgres

# 2. Dependencias y migraciones
npm install
npx prisma migrate dev
npx prisma db seed

# 3. API
npm run start:dev
```

## Usuarios seed

| Rol | Email | Password |
|-----|-------|----------|
| ADMIN | admin@fleetexpense.local | Admin123! |
| DRIVER | carlos.gomez@fleetexpense.local | Admin123! |
| DRIVER | maria.lopez@fleetexpense.local | Admin123! |

## Variables de entorno

Ver `.env.example`.

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Conexión PostgreSQL (dev: puerto 5433) |
| `JWT_SECRET` | Firma de tokens |
| `JWT_EXPIRES_IN` | Expiración (ej. `8h`) |
| `FRONTEND_URL` | CORS |
| `SERVICE_API_KEY` | Clave para n8n (`X-API-Key`) |

## Endpoints principales

### Auth
- `POST /api/auth/login`

### Drivers
- `GET /api/drivers`
- `GET /api/drivers/:id`
- `GET /api/drivers/document/:document` *(JWT o API Key)*
- `GET /api/drivers/document/:document/expenses` *(JWT o API Key)*
- `POST /api/drivers`
- `PATCH /api/drivers/:id`
- `PATCH /api/drivers/:id/status`

### Expenses
- `GET /api/expenses`
- `GET /api/expenses/:id`
- `POST /api/expenses` *(JWT admin o API Key; body con `force?`)*
- `PATCH /api/expenses/:id`
- `POST /api/expenses/:id/review`
- `POST /api/expenses/:id/reject`

### Dashboard / Audit
- `GET /api/dashboard/summary`
- `GET /api/audit-logs`

## Ejemplo n8n — crear gasto

```http
POST /api/expenses
X-API-Key: <SERVICE_API_KEY>
Content-Type: application/json

{
  "driverId": "<uuid>",
  "nit": "900123456-1",
  "merchantName": "TERPEL",
  "amount": 85000,
  "expenseDate": "2026-08-08",
  "description": "Combustible",
  "invoiceNumber": "FV-123",
  "source": "WHATSAPP"
}
```

Si 409 (duplicado), preguntar al conductor y reintentar con `"force": true`.

## Integración futura

WhatsApp → Evolution API → n8n (OCR/IA) → **esta API** → PostgreSQL

n8n **no** accede a PostgreSQL directamente.

## Estructura

```
src/
├── auth/
├── drivers/
├── expenses/
├── dashboard/
├── audit/
├── common/
├── prisma/
└── main.ts
```
