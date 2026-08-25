APIARIO LA RUDA - PANEL DE PEDIDOS Y SEGUIMIENTO
================================================

QUÉ SE AGREGÓ
- Botón "Seguir pedido" en la web pública.
- seguimiento.html: búsqueda por código + link directo.
- admin.html: panel privado de pedidos.
- Alta y edición de comprador, artículos, cantidades, precios, fecha y notas.
- 7 etapas:
  1. Pedido ingresado
  2. Material preparado
  3. Reina fecundada
  4. Pendiente de pago
  5. Pago confirmado
  6. Envío / entrega
  7. Finalizado
- Historial de cambios de estado.
- Código automático tipo LR-26-A1B2C3.
- Link individual para enviar al comprador.
- Botón de WhatsApp con mensaje predeterminado según el estado.
- El pedido se puede modificar y se pueden agregar/quitar artículos.
- Diseño responsive y con la misma estética del sitio actual.

IMPORTANTE SOBRE WHATSAPP
El botón abre el chat correcto con el mensaje ya redactado. WhatsApp exige que
el usuario confirme el envío; una web normal no puede pulsar "Enviar" sola.
Para envío 100% automático haría falta WhatsApp Business Platform/API.

CONFIGURACIÓN DE SUPABASE
1. Crear un proyecto en https://supabase.com
2. Ir a SQL Editor > New query.
3. Pegar TODO el contenido de supabase_setup.sql y ejecutarlo.
4. Ir a Authentication > Users > Add user.
5. Crear el usuario interno con:
   Email: admin@apiariolaruda.local
   Password: usar la contraseña de administración definida por Apiario La Ruda.
   Marcar/usar creación confirmada para que no dependa de correo.
6. Ir a Project Settings / API y copiar:
   - Project URL
   - anon / public key
7. Abrir assets/supabase-config.js y completar:
   supabaseUrl
   supabaseAnonKey
8. Subir todos los archivos al hosting, igual que la web actual.

ACCESOS
- Web: https://apiario.laruda.com.ar/
- Seguimiento: https://apiario.laruda.com.ar/seguimiento.html
- Administración: https://apiario.laruda.com.ar/admin.html

LOGIN DEL PANEL
El usuario visible es "admin". Internamente se autentica contra el usuario de
Supabase indicado arriba. La contraseña NO está guardada en el HTML ni en JS.

PRUEBA RECOMENDADA
1. Ingresar a admin.html.
2. Crear un pedido.
3. Copiar el link de seguimiento.
4. Abrirlo en una ventana incógnita o en otro celular.
5. Cambiar el estado en admin.html y volver a consultar el link.


KEEPALIVE AUTOMATICO DE SUPABASE
--------------------------------
El archivo supabase_setup.sql ya incluye la función segura la_ruda_keepalive().
Para generar actividad aunque no entre ningún cliente, configurar cron-job.org
para llamar esa función cada 6 horas. Ver instrucciones completas en:

  KEEPALIVE_SUPABASE.txt

La consulta es solo lectura y no toca el contenido de los pedidos.


PROYECTO SUPABASE CONFIGURADO
Project URL: https://bfqqpniakxznbgfbektb.supabase.co
Falta únicamente pegar la Publishable key en assets/supabase-config.js.
