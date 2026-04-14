-- ================================================================
-- 1_preimport.sql  — Ejecutar ANTES de importar los CSV
-- ================================================================

-- Agregar columnas nuevas (si no existen)
ALTER TABLE public.case_invoices
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS nota_cliente   text;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS categoria text;

-- Hacer case_id nullable TEMPORALMENTE para permitir importar sin case_id
-- (Se restaurara en 2_postimport.sql)
ALTER TABLE public.case_invoices
  ALTER COLUMN case_id DROP NOT NULL;

-- Listo. Ahora importa los CSV en Supabase Table Editor:
--   1. case_invoices  <-  facturas_enc_import.csv
--   2. invoice_lines  <-  facturas_det_import.csv
-- Luego ejecuta 2_postimport.sql
