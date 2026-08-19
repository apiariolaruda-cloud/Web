APIARIO LA RUDA - WEB FUNCIONAL

ARCHIVOS
- index.html
- assets/logo-horizontal.jpg
- assets/logo-redondo.jpg

CÓMO ABRIRLA
1. Abrir index.html con Chrome, Edge o Firefox.
2. No necesita instalación ni servidor para verla.
3. Para publicarla, subir la carpeta completa a cualquier hosting estático.

DÓNDE CAMBIAR LOS DATOS
Abrir index.html y buscar la sección:
CONFIGURACIÓN

1) WHATSAPP
Reemplazar:
const WHATSAPP_NUMBER = "";

Por ejemplo:
const WHATSAPP_NUMBER = "54911XXXXXXXX";

Usar números solamente, con código de país y característica.

2) GOOGLE FORMS
En Google Forms:
Enviar > símbolo <> > copiar URL del iframe.

Después reemplazar:
const GOOGLE_FORM_EMBED_URL = "";

Por:
const GOOGLE_FORM_EMBED_URL = "TU_URL";

3) PRODUCTOS
Cada producto está dentro del array:
const products = [...]

Cambiar:
- name
- category
- description
- image
- buyUrl

Si buyUrl queda vacío, el botón COMPRAR abre WhatsApp automáticamente.

4) FOTOS DE PRODUCTOS
Guardar las fotos dentro de assets.

Ejemplo:
assets/miel-500.jpg

Y en el producto:
image: "assets/miel-500.jpg"

La web tiene:
- diseño responsive
- menú móvil
- animaciones
- 7 tarjetas
- modal al tocar la foto
- compra directa
- consulta WhatsApp
- WhatsApp flotante
- Google Forms embebible
