-- T_SCHOOL_REG: Add registration fields to School
-- email, phone, CNPJ (encrypted+hash), address, sportTypes array

ALTER TABLE "School"
    ADD COLUMN "email"         VARCHAR(254),
    ADD COLUMN "phoneE164"     VARCHAR(20),
    ADD COLUMN "cnpjEncrypted" TEXT,
    ADD COLUMN "cnpjHash"      VARCHAR(64),
    ADD COLUMN "postalCode"    VARCHAR(10),
    ADD COLUMN "street"        VARCHAR(300),
    ADD COLUMN "addressNumber" VARCHAR(20),
    ADD COLUMN "complement"    VARCHAR(100),
    ADD COLUMN "district"      VARCHAR(100),
    ADD COLUMN "city"          VARCHAR(100),
    ADD COLUMN "state"         VARCHAR(2),
    ADD COLUMN "country"       VARCHAR(60),
    ADD COLUMN "sportTypes"    TEXT[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "School_cnpjHash_key" ON "School"("cnpjHash");
