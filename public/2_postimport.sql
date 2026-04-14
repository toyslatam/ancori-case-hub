-- ================================================================
-- 2_postimport.sql  — Ejecutar DESPUES de importar los CSV
-- ================================================================

-- Vincular facturas a sus casos por n_tarea
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 15 LIMIT 1) WHERE numero_factura = '000001' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 14 LIMIT 1) WHERE numero_factura = '000002' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 69 LIMIT 1) WHERE numero_factura = '000003' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 72 LIMIT 1) WHERE numero_factura = '000004' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 71 LIMIT 1) WHERE numero_factura = '000005' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 74 LIMIT 1) WHERE numero_factura = '000006' AND case_id IS NULL;
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 54 LIMIT 1) WHERE numero_factura = '000007' AND case_id IS NULL;
-- FACTURA 000008: sin Anc_Tareas — vincular manualmente:
-- UPDATE public.case_invoices SET case_id = '<uuid-del-caso>' WHERE numero_factura = '000008';
UPDATE public.case_invoices SET case_id = (SELECT id FROM public.cases WHERE n_tarea = 1 LIMIT 1) WHERE numero_factura = '000009' AND case_id IS NULL;

-- Eliminar facturas que quedaron sin case_id (opcional, o vincularlas manualmente)
-- DELETE FROM public.case_invoices WHERE case_id IS NULL;

-- Restaurar NOT NULL en case_id (solo si no quedan filas con case_id IS NULL)
-- Verifica primero:
SELECT numero_factura, case_id FROM public.case_invoices WHERE case_id IS NULL;

-- Si el resultado anterior esta vacio, restaura la restriccion:
-- ALTER TABLE public.case_invoices ALTER COLUMN case_id SET NOT NULL;

-- Verificacion final:
SELECT ci.numero_factura, ci.fecha_factura, ci.total, ci.estado,
       c.n_tarea, COUNT(il.id) AS lineas
FROM public.case_invoices ci
LEFT JOIN public.cases c ON c.id = ci.case_id
LEFT JOIN public.invoice_lines il ON il.invoice_id = ci.id
GROUP BY ci.id, c.n_tarea
ORDER BY ci.numero_factura;