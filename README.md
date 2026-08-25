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
- `POST /api/drivers/verify` *(API Key: cédula + celular; 404 unificado si fallan o inactivo)*
- `GET /api/drivers/verify?document=&phone=`
- `GET /api/drivers/document/:document/expenses?phone=&status?&from?&to?&merchant?` *(API Key: consulta con filtros)*
- `GET /api/drivers/document/:document` *(solo JWT admin; no API Key)*
- `POST /api/drivers`
- `PATCH /api/drivers/:id`
- `PATCH /api/drivers/:id/status`

### Expenses
- `GET /api/expenses` *(JWT; o API Key con `document` + `phone` y filtros `status`/`from`/`to`/`merchant`)*
- `GET /api/expenses/:id`
- `POST /api/expenses` *(JWT admin o API Key; con API Key requiere `document` + `phone` + `driverId` coherentes; `force?`)*
- `PATCH /api/expenses/:id`
- `POST /api/expenses/:id/review`
- `POST /api/expenses/:id/reject`

### Dashboard / Audit
- `GET /api/dashboard/summary`
- `GET /api/audit-logs`

## n8n — verificación e identidad

La autorización del bot no se basa solo en la API Key.

1. Verificar: `POST /api/drivers/verify` con `document` + `phone` del WhatsApp.
2. Conservar `driver.id` de la respuesta en el flow.
3. Consultar gastos (ejemplo “pendientes de este mes”):

```http
GET /api/drivers/document/1020304050/expenses?phone=3001234567&status=PENDING_REVIEW&from=2026-08-01&to=2026-08-31
X-API-Key: <SERVICE_API_KEY>
```

O bien:

```http
GET /api/expenses?document=1020304050&phone=3001234567&status=PENDING_REVIEW&from=2026-08-01&to=2026-08-31
X-API-Key: <SERVICE_API_KEY>
```

La respuesta incluye `merchantName`, `amount`, `expenseDate`, `status` y `statusLabel` (español).

**404 unificado en verify:** cédula inexistente vs celular incorrecto no se distinguen (evita oráculo). **Inactivo:** `verified: true` con `canCreateExpenses: false`; puede listar gastos e info. **Crear gasto** con inactivo → **403** `code: DRIVER_INACTIVE`.

## Errores (contrato para n8n)

Siempre incluyen **`code`** (estable). El bot debe ramificar por `code`, nunca por el texto de `message`.

```json
{
  "statusCode": 404,
  "code": "DRIVER_NOT_FOUND",
  "message": "Driver not found",
  "errors": ["No se encontró un conductor con esos datos..."]
}
```

| `code` | HTTP | Uso en el bot |
|--------|------|----------------|
| `DRIVER_NOT_FOUND` | 404 | Identidad no coincide |
| `DRIVER_INACTIVE` | 403 | Solo consulta (no crear gasto) |
| `DRIVER_DOCUMENT_PHONE_REQUIRED` | 400 | Falta cédula/celular con API Key |
| `DRIVER_IDENTITY_MISMATCH` | 403 | driverId ≠ cédula+celular |
| `EXPENSE_DUPLICATE` | 409 | Preguntar y reintentar con `force` (`reason`, `existingExpense`) |
| `EXPENSE_CREATE_FAILED` | 400 | Reglas de negocio del gasto |
| `VALIDATION_FAILED` | 400 | Body inválido (DTO) |
| `UNAUTHORIZED` / `INVALID_CREDENTIALS` | 401 | Auth panel |
| `FORBIDDEN` | 403 | Genérico |

Lista en código: `src/common/errors/api-error-codes.ts`.

## Ejemplo n8n — crear gasto

```http
POST /api/expenses
X-API-Key: <SERVICE_API_KEY>
Content-Type: application/json

{
  "driverId": "<uuid del verify>",
  "document": "1020304050",
  "phone": "3001234567",
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
