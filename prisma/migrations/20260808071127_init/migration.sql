-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "expenses";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fleet";

-- CreateEnum
CREATE TYPE "auth"."UserRole" AS ENUM ('ADMIN', 'DRIVER');

-- CreateEnum
CREATE TYPE "fleet"."DriverStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "expenses"."ExpenseStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'REJECTED');

-- CreateEnum
CREATE TYPE "expenses"."ExpenseSource" AS ENUM ('WHATSAPP', 'ADMIN', 'API');

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "auth"."UserRole" NOT NULL,
    "driver_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet"."drivers" (
    "id" UUID NOT NULL,
    "document" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "plate" TEXT,
    "status" "fleet"."DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses"."expenses" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "nit" TEXT NOT NULL,
    "merchant_name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "description" TEXT,
    "invoice_number" TEXT,
    "status" "expenses"."ExpenseStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "expenses"."ExpenseSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_driver_id_key" ON "auth"."users"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_document_key" ON "fleet"."drivers"("document");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "fleet"."drivers"("phone");

-- CreateIndex
CREATE INDEX "expenses_driver_id_idx" ON "expenses"."expenses"("driver_id");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"."expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"."expenses"("expense_date");

-- CreateIndex
CREATE INDEX "expenses_merchant_name_idx" ON "expenses"."expenses"("merchant_name");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit"."audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit"."audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "fleet"."drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses"."expenses" ADD CONSTRAINT "expenses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "fleet"."drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
