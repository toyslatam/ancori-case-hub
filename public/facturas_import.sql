-- ================================================================
-- MIGRACIÓN DE FACTURAS — generado por generar_facturas_import.py
-- Fecha: 2026-04-14
-- ================================================================

-- PASO 1: Agregar columnas si no existen
ALTER TABLE public.case_invoices
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS nota_cliente   text;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS categoria text;

-- PASO 2: Insertar facturas (encabezado)
INSERT INTO public.case_invoices
  (id, case_id, society_id, term_id, fecha_factura, fecha_vencimiento,
   subtotal, impuesto, total, estado, numero_factura, nota_cliente)
VALUES
  ('fd13fa6c-83b1-46d0-8fdf-8a6241c6e8b1', NULL, '43890543-ccf2-4ea6-9b6d-01c1ec91957e', NULL, '2026-01-16', '2026-01-17', 1200.0, 0.0, 1200.0, 'pendiente', '000001', NULL),
  ('13172042-560d-4556-91e5-cc3bab7441e7', NULL, '02befbad-c3f5-4455-b7ab-e53eceac1d20', NULL, '2026-01-16', '2026-01-17', 285.0, 5.25, 290.25, 'pendiente', '000002', NULL),
  ('2836f182-66cd-49c5-85a1-c3820195139e', NULL, '5600d760-bcd2-43a3-b4ea-0bc91922cf32', NULL, '2026-02-19', '2026-02-28', 350.0, 10.5, 360.5, 'pendiente', '000003', NULL),
  ('49b875f7-b791-49a9-a6cb-8c124a26f0a9', NULL, '02befbad-c3f5-4455-b7ab-e53eceac1d20', NULL, '2026-02-20', '2026-02-27', 0.0, 0.0, 0.0, 'pendiente', '000004', NULL),
  ('08b0de0c-db4a-4dd1-ab69-28cfc10583a1', NULL, NULL, NULL, '2026-02-20', '2026-02-27', 475.0, 17.5, 492.5, 'pendiente', '000005', NULL),
  ('366a929b-2ca5-4811-9d75-9351b0311f3f', NULL, '5c292b8c-9963-486b-81b7-b39fa650c380', NULL, '2026-02-24', '2026-03-24', 385.0, 17.5, 402.5, 'pendiente', '000006', NULL),
  ('d178a592-55e5-41c2-b85e-26cb76c4a328', NULL, 'dc360e7f-2d00-49dc-8f7a-bc2211aeb7ad', NULL, '2026-02-25', '2026-02-25', 413.0, 8.75, 421.75, 'pendiente', '000007', NULL),
  ('da304b71-7994-4af6-b79b-5d23288c1b8e', NULL, '71a0884d-774e-490f-a01e-563e3821ac1b', NULL, '2026-02-25', '2026-02-25', 450.0, 21.0, 471.0, 'pendiente', '000008', NULL),
  ('f6e901e4-c63e-4ed8-a594-a1a3de9fb774', NULL, NULL, NULL, '2026-02-27', '2026-02-28', 248.0, 3.5, 251.5, 'pendiente', '000009', NULL);

-- PASO 3: Insertar líneas de factura (detalle)
INSERT INTO public.invoice_lines
  (id, invoice_id, descripcion, cantidad, tarifa, itbms, categoria)
VALUES
  ('b938ee93-0629-4004-93e1-7ae6dbc6a57f', '13172042-560d-4556-91e5-cc3bab7441e7', 'Honorario por Diligenciamiento de documento Apostillado', 1.0, 75.0, 7.0, 'Honorarios'),
  ('8761f659-3f8b-4de5-a0c2-efbaecf143ae', '13172042-560d-4556-91e5-cc3bab7441e7', 'Gastos Legales', 1.0, 135.0, 0.0, 'Gastos'),
  ('c50d5304-8e3c-4cba-98e2-6ca0b3bb59ce', '13172042-560d-4556-91e5-cc3bab7441e7', 'DHL', 1.0, 75.0, 0.0, 'Gastos'),
  ('d237545e-3ef7-4588-a732-96b76bb97dea', 'fd13fa6c-83b1-46d0-8fdf-8a6241c6e8b1', '4 Contratos de Compraventa de acciones', 1.0, 1200.0, 0.0, 'Gastos'),
  ('4d18c871-c585-4ad6-b3ba-7ede4cb0ac80', '2836f182-66cd-49c5-85a1-c3820195139e', 'Diligenciamiento de Certificado de Existencia debidamente notariado', 1.0, 150.0, 7.0, 'Honorarios'),
  ('0ea85e05-a3d4-49b1-b294-ef8336824b84', '2836f182-66cd-49c5-85a1-c3820195139e', 'Gastos Legales', 1.0, 200.0, 0.0, 'Gastos'),
  ('3b813e0f-e747-498d-b608-d5c5a428c5d0', '08b0de0c-db4a-4dd1-ab69-28cfc10583a1', 'Anulación y Emisión de Acciones', 1.0, 250.0, 7.0, 'Honorarios'),
  ('a5e99e71-d8be-45ec-8191-bd00f8247924', '08b0de0c-db4a-4dd1-ab69-28cfc10583a1', 'Gastos legales', 1.0, 225.0, 0.0, 'Gastos'),
  ('bcf4adaa-437a-459f-8f1f-dc1332b546ab', '366a929b-2ca5-4811-9d75-9351b0311f3f', 'Anulacion y nueva emision de Acciones Luisa Boada a Sofia Boada', 1.0, 250.0, 7.0, 'Honorarios'),
  ('d7aed049-7b59-457a-b13f-3b114b41f533', '366a929b-2ca5-4811-9d75-9351b0311f3f', 'Gastos Legales', 1.0, 135.0, 0.0, 'Gastos'),
  ('3cedf760-a335-4963-b277-c2f040f51b52', 'da304b71-7994-4af6-b79b-5d23288c1b8e', 'Anulacion y emision de acciones nuevas', 1.0, 300.0, 7.0, 'Honorarios'),
  ('10beaf6a-8887-44de-82d8-ba52ce3c359d', 'da304b71-7994-4af6-b79b-5d23288c1b8e', 'Gastos varios', 1.0, 150.0, 0.0, 'Gastos'),
  ('d95f96b4-3985-481d-8c15-19274fccfc85', 'd178a592-55e5-41c2-b85e-26cb76c4a328', 'Honorarios extras', 1.0, 75.0, 7.0, 'Honorarios'),
  ('4ff7d026-06cc-4301-88ee-abee325a626e', 'd178a592-55e5-41c2-b85e-26cb76c4a328', 'Gastos extras', 1.0, 88.0, 0.0, 'Gastos'),
  ('1f43aa2b-c8db-45fe-8cf4-dab7d1905469', 'd178a592-55e5-41c2-b85e-26cb76c4a328', 'Honorarios por servicio', 1.0, 50.0, 7.0, 'Honorarios'),
  ('9087d91b-3dbc-4d5d-910f-3d01599e7920', 'd178a592-55e5-41c2-b85e-26cb76c4a328', 'Gastos de servicio', 2.0, 100.0, 0.0, 'Gastos'),
  ('9bd53c14-feac-4a8c-a71e-51bf1d4ce42b', 'f6e901e4-c63e-4ed8-a594-a1a3de9fb774', 'Honorarios por servicios', 2.0, 25.0, 7.0, 'Honorarios'),
  ('c475770a-cbf3-49ff-aee7-27f96743975a', 'f6e901e4-c63e-4ed8-a594-a1a3de9fb774', 'Gastos de servicios2', 3.0, 66.0, 0.0, 'Gastos');

-- PASO 4 (opcional): Vincular facturas a casos por n_tarea
-- Si algunos case_id quedaron NULL, actualiza manualmente:
-- UPDATE public.case_invoices ci
-- SET case_id = c.id
-- FROM public.cases c
-- WHERE ci.case_id IS NULL AND c.n_tarea = <numero>;

-- VERIFICAR:
SELECT ci.numero_factura, ci.fecha_factura, ci.total, ci.estado,
       c.n_tarea, COUNT(il.id) AS lineas
FROM public.case_invoices ci
LEFT JOIN public.cases c ON c.id = ci.case_id
LEFT JOIN public.invoice_lines il ON il.invoice_id = ci.id
GROUP BY ci.id, c.n_tarea
ORDER BY ci.numero_factura;