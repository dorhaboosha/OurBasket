-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "list_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_record" (
    "id" TEXT NOT NULL,
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_record_item" (
    "id" TEXT NOT NULL,
    "purchaseRecordId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "categoryId" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "categoryColor" TEXT NOT NULL,
    "categoryIcon" TEXT NOT NULL,

    CONSTRAINT "purchase_record_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_normalizedName_key" ON "category"("normalizedName");

-- CreateIndex
CREATE INDEX "category_sortOrder_idx" ON "category"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_normalizedName_key" ON "product"("normalizedName");

-- CreateIndex
CREATE INDEX "product_categoryId_sortOrder_idx" ON "product"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "purchase_record_purchasedAt_idx" ON "purchase_record"("purchasedAt" DESC);

-- CreateIndex
CREATE INDEX "purchase_record_item_purchaseRecordId_idx" ON "purchase_record_item"("purchaseRecordId");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_record_item" ADD CONSTRAINT "purchase_record_item_purchaseRecordId_fkey" FOREIGN KEY ("purchaseRecordId") REFERENCES "purchase_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules Prisma can't express in the schema. Prisma doesn't diff CHECK constraints
-- or triggers, so later migrations leave them alone.
-- ---------------------------------------------------------------------------

-- Names: not blank, at most 60 characters (spec 7.1, 8.1). The app trims first.
ALTER TABLE "category" ADD CONSTRAINT "category_name_check"
  CHECK (btrim("name") <> '' AND char_length("name") <= 60);
ALTER TABLE "category" ADD CONSTRAINT "category_normalized_name_check"
  CHECK ("normalizedName" <> '');
ALTER TABLE "category" ADD CONSTRAINT "category_version_check" CHECK ("version" >= 1);

ALTER TABLE "product" ADD CONSTRAINT "product_name_check"
  CHECK (btrim("name") <> '' AND char_length("name") <= 60);
ALTER TABLE "product" ADD CONSTRAINT "product_normalized_name_check"
  CHECK ("normalizedName" <> '');
ALTER TABLE "product" ADD CONSTRAINT "product_version_check" CHECK ("version" >= 1);

-- Quantities: whole numbers from 1 to 999 (spec 8.1).
ALTER TABLE "product" ADD CONSTRAINT "product_quantity_check"
  CHECK ("quantity" BETWEEN 1 AND 999);
ALTER TABLE "purchase_record_item" ADD CONSTRAINT "purchase_record_item_quantity_check"
  CHECK ("quantity" BETWEEN 1 AND 999);

-- list_state holds a single row.
ALTER TABLE "list_state" ADD CONSTRAINT "list_state_single_row_check" CHECK ("id" = 1);
ALTER TABLE "list_state" ADD CONSTRAINT "list_state_revision_check" CHECK ("revision" >= 0);

-- The system category "General" (spec 6.3): there is at most one, it can't be deleted,
-- and it can't stop being the system category. The server rejects these anyway; this
-- keeps the data right even if a bug or a direct query tries otherwise.
CREATE FUNCTION "category_protect_system"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."isSystem" THEN
      RAISE EXCEPTION 'The system category can''t be deleted'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."isSystem" AND NOT NEW."isSystem" THEN
    RAISE EXCEPTION 'The system category can''t stop being the system category'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."isSystem" AND EXISTS (
    SELECT 1 FROM "category" WHERE "isSystem" AND "id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'There can be only one system category'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "category_protect_system"
  BEFORE INSERT OR UPDATE OR DELETE ON "category"
  FOR EACH ROW EXECUTE FUNCTION "category_protect_system"();
