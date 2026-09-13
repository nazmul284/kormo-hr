-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaxpayerCategory" ADD VALUE 'SINGLE';
ALTER TYPE "TaxpayerCategory" ADD VALUE 'MARRIED_JOINT';
ALTER TYPE "TaxpayerCategory" ADD VALUE 'MARRIED_SEPARATE';
ALTER TYPE "TaxpayerCategory" ADD VALUE 'HEAD_OF_HOUSEHOLD';
ALTER TYPE "TaxpayerCategory" ADD VALUE 'NON_RESIDENT';

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'INTL',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-US',
ADD COLUMN     "weekend_days" INTEGER[] DEFAULT ARRAY[6, 0]::INTEGER[],
ALTER COLUMN "timezone" SET DEFAULT 'UTC',
ALTER COLUMN "currency" SET DEFAULT 'USD',
ALTER COLUMN "fiscal_year_start_month" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "employee" ALTER COLUMN "nationality" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employee_address" ALTER COLUMN "country" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tax_config" ADD COLUMN     "non_taxable_flat" DECIMAL(14,2),
ALTER COLUMN "country" SET DEFAULT 'INTL';
