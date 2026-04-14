-- Datos iniciales (mock) con UUIDs fijos para coincidir con la app.
-- Ejecutar después de schema.sql (o: npm run seed:db con DATABASE_URL).

begin;

truncate table public.invoice_lines, public.case_invoices, public.case_expenses, public.case_comments, public.cases, public.societies, public.clients, public.directores, public.services, public.invoice_terms, public.categories, public.qb_items restart identity cascade;

-- Clientes 10000000-...-0001 .. 0005
insert into public.clients (id, nombre, razon_social, numero, email, telefono, identificacion, direccion, activo, created_at) values
  ('10000000-0000-4000-8000-000000000001', 'SAUL SASSON', 'SAUL SASSON', 1, 'saul@email.com', '+507 6000-1111', 'PE-1234', 'Panamá City', true, '2024-01-10'),
  ('10000000-0000-4000-8000-000000000002', 'ANA MARIA GOMEZ', 'ANA MARIA GOMEZ', 2, 'ana@email.com', '+507 6000-2222', 'PE-5678', 'Costa del Este', true, '2024-01-15'),
  ('10000000-0000-4000-8000-000000000003', 'JOSE FERNANDO CADAVID', 'JOSE FERNANDO CADAVID', 3, 'jose@email.com', '+507 6000-3333', 'PE-9012', 'Punta Pacífica', true, '2024-02-01'),
  ('10000000-0000-4000-8000-000000000004', 'SUSANA BERENGUER', 'SUSANA BERENGUER', 4, 'susana@email.com', '+507 6000-4444', 'PE-3456', 'El Cangrejo', true, '2024-02-10'),
  ('10000000-0000-4000-8000-000000000005', 'JEAN RICHA HOLMES', 'JEAN RICHA HOLMES', 5, 'jean@email.com', '+507 6000-5555', 'PE-7890', 'San Francisco', true, '2024-03-01');

select setval('public.clients_numero_seq', (select coalesce(max(numero), 1) from public.clients));

insert into public.directores (id, nombre, comentarios, activo, fecha_vencimiento_documento, tipo_documento, created_at) values
  ('90000000-0000-4000-8000-000000000001', 'MARIA ISABEL PALMA', '', true, '2026-12-31', 'Cedula', '2024-06-01'),
  ('90000000-0000-4000-8000-000000000002', 'EYRA RUTH ROMERO', 'Notas internas', true, null, 'Pasaporte', '2024-06-15');

insert into public.societies (
  id, client_id, nombre, razon_social, tipo_sociedad, correo, telefono, activo, created_at,
  id_qb, ruc, dv, nit, presidente_id, tesorero_id, secretario_id, pago_tasa_unica, fecha_inscripcion
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'HASANI S.A.', 'HASANI SOCIEDAD ANONIMA', 'SOCIEDADES', 'hasani@corp.com', '+507 300-1111', true, '2024-01-12',
    1001, '', '', '', '90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', null, '', '2024-03-15'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'ANA MARIA GOMEZ', 'ANA MARIA GOMEZ', 'FUNDACIONES', 'ana@corp.com', '+507 300-2222', true, '2024-01-16',
    null, '', '', '', null, null, null, 'Sí', '2023-08-01'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'ABASA GROUP CORP.', 'ABASA GROUP CORPORATION', 'B.V.I', 'abasa@corp.com', '+507 300-3333', true, '2024-02-05',
    null, '123456', '7', '', '90000000-0000-4000-8000-000000000001', null, null, '', '2022-01-10'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'FBBC CORPORATION', 'FBBC CORPORATION', 'SOCIEDADES', 'fbbc@corp.com', '+507 300-4444', true, '2024-02-15',
    null, '', '', '', null, null, null, 'No', '2024-11-20'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'DOVLE CINCUENTENARIO 5B-200, S.A.', 'DOVLE CINCUENTENARIO 5B-200, S.A.', 'SOCIEDADES', 'dovle@corp.com', '+507 300-5555', true, '2024-03-01',
    null, '', '', '', null, null, null, '', '2024-06-01');

insert into public.services (id, nombre, categoria, descripcion, activo) values
  ('30000000-0000-4000-8000-000000000001', 'Constitución Sociedad Anónima', 'Corporativo', 'Constitución de S.A.', true),
  ('30000000-0000-4000-8000-000000000002', 'Emisión de Poder General o Especial', 'Corporativo', 'Emisión de poderes', true),
  ('30000000-0000-4000-8000-000000000003', 'Certificado de Existencia', 'Corporativo', 'Certificado de existencia otros servicios corporativos', true),
  ('30000000-0000-4000-8000-000000000004', 'Apostilla de Documento', 'Legal', 'Apostilla otros servicios corporativos', true);

insert into public.invoice_terms (id, nombre, dias_vencimiento, activo) values
  ('40000000-0000-4000-8000-000000000001', 'Pago Inmediato', 0, true),
  ('40000000-0000-4000-8000-000000000002', 'Net 15', 15, true),
  ('40000000-0000-4000-8000-000000000003', 'Net 30', 30, true);

insert into public.categories (id, nombre, id_qb, activo, created_at) values
  ('41000000-0000-4000-8000-000000000001', 'CONSTITUCION DE PERSONA JURÍDICA', 55, true, '2024-01-10'),
  ('41000000-0000-4000-8000-000000000002', 'SERVICIOS TERCERIZADOS', 52, true, '2024-01-10'),
  ('41000000-0000-4000-8000-000000000003', 'GASTOS NOTARIA', 50, true, '2024-01-10'),
  ('41000000-0000-4000-8000-000000000004', 'TRÁMITES REGISTRALES', 51, true, '2024-01-10'),
  ('41000000-0000-4000-8000-000000000005', 'OTROS SERVICIOS', null, true, '2024-06-01');

insert into public.qb_items (id, nombre_interno, nombre_qb, qb_item_id, tipo, impuesto_default, activo) values
  ('50000000-0000-4000-8000-000000000001', 'Constitución S.A.', 'Corp Formation SA', 'QB-001', 'Servicio', 7, true),
  ('50000000-0000-4000-8000-000000000002', 'Poder General', 'Power of Attorney', 'QB-002', 'Servicio', 7, true),
  ('50000000-0000-4000-8000-000000000003', 'Certificado Existencia', 'Good Standing Certificate', 'QB-003', 'Servicio', 7, true);

insert into public.cases (
  id, numero_caso, client_id, society_id, service_id, descripcion, estado, etapa,
  gastos_cotizados, cliente_temporal, prioridad_urgente, creado_por, responsable, observaciones, fecha_caso, created_at
) values
  ('60000000-0000-4000-8000-000000000001', '00006', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   'Constitución Sociedad Anónima', 'Pendiente', 'Cotización', 5000, false, false, 'Yolimar Gordón', 'María Isabel Palma', 'SOCIEDAD NUEVA', '2024-12-01', '2024-12-01'),
  ('60000000-0000-4000-8000-000000000002', '00005', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
   'Emisión de Poder General o Especial - No Inscrito OTROS SERVICIOS CORPORATIVOS', 'Pendiente', 'En Proceso', 3000, false, false, 'Yolimar Gordón', 'María Isabel Palma', '', '2024-11-20', '2024-11-20'),
  ('60000000-0000-4000-8000-000000000003', '00004', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001',
   'Constitución Sociedad Anónima', 'Completado/Facturado', 'Completado', 4500, false, false, 'Yolimar Gordón', 'Yolimar Gordón', 'Ingresó ayer 9 de dic en curso en rp', '2024-11-15', '2024-11-15'),
  ('60000000-0000-4000-8000-000000000004', '00003', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003',
   'Certificado de Existencia OTROS SERVICIOS CORPORATIVOS', 'Completado/Facturado', 'Facturado', 2000, false, false, 'Yolimar Gordón', 'Yolimar Gordón', 'CRP y poder firmado por MIP', '2024-11-10', '2024-11-10'),
  ('60000000-0000-4000-8000-000000000005', '00002', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003',
   'Certificado de Existencia OTROS SERVICIOS CORPORATIVOS', 'Completado/Facturado', 'Facturado', 2500, false, false, 'Yolimar Gordón', 'Yolimar Gordón', 'MIP Gestionar CRP', '2024-10-28', '2024-10-28'),
  ('60000000-0000-4000-8000-000000000006', '00001', '10000000-0000-4000-8000-000000000005', null, '30000000-0000-4000-8000-000000000004',
   'Apostilla de Documento OTROS SERVICIOS CORPORATIVOS', 'Pendiente', 'En Proceso', 1500, true, true, 'Yolimar Gordón', 'María Isabel Palma', '', '2024-10-15', '2024-10-15');

insert into public.case_comments (id, case_id, user_name, comentario, created_at) values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'Yolimar Gordón', 'Caso creado, pendiente de documentos del cliente.', '2024-12-01T10:00:00'),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', 'Yolimar Gordón', 'Documentos entregados al cliente.', '2024-12-08T14:30:00'),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'María Isabel Palma', 'Sociedad registrada exitosamente.', '2024-12-09T09:00:00'),
  ('70000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000004', 'Yolimar Gordón', 'Certificado emitido.', '2024-11-12T11:00:00'),
  ('70000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000005', 'Yolimar Gordón', 'Pendiente firma del cliente.', '2024-10-30T10:00:00'),
  ('70000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000005', 'María Isabel Palma', 'Firmado y entregado.', '2024-11-02T16:00:00'),
  ('70000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-000000000006', 'Yolimar Gordón', 'Documento recibido para apostilla.', '2024-10-15T09:00:00'),
  ('70000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-000000000006', 'Yolimar Gordón', 'En proceso de apostilla en el MRE.', '2024-10-18T11:00:00'),
  ('70000000-0000-4000-8000-000000000009', '60000000-0000-4000-8000-000000000006', 'María Isabel Palma', 'Seguimiento realizado, esperando respuesta.', '2024-10-22T14:00:00'),
  ('70000000-0000-4000-8000-000000000010', '60000000-0000-4000-8000-000000000006', 'Yolimar Gordón', 'Apostilla lista, pendiente de entrega.', '2024-10-25T10:00:00'),
  ('70000000-0000-4000-8000-000000000011', '60000000-0000-4000-8000-000000000006', 'María Isabel Palma', 'Cliente notificado para recoger.', '2024-10-28T09:30:00'),
  ('70000000-0000-4000-8000-000000000012', '60000000-0000-4000-8000-000000000006', 'Yolimar Gordón', 'Entregado al cliente.', '2024-10-30T16:00:00');

insert into public.case_expenses (id, case_id, descripcion, cantidad, importe, fecha) values
  ('80000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'Timbres fiscales', 2, 500, '2024-11-20'),
  ('80000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', 'Registro Público', 1, 1500, '2024-11-22'),
  ('80000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000005', 'Gestión RP', 1, 800, '2024-10-30'),
  ('80000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000006', 'Tasa apostilla MRE', 1, 300, '2024-10-16'),
  ('80000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006', 'Mensajería', 2, 50, '2024-10-17');

commit;
