"use client";
import { useState } from "react";

// ── Manual de Instalación ─────────────────────────────────────────────────────
interface InstallSection {
  id: string; icon: string; title: string; tag: string;
  steps: { title: string; text: string; warning?: string; tip?: string }[];
}

const INSTALL_SECTIONS: InstallSection[] = [
  {
    id: "meta-wa", icon: "💬", title: "WhatsApp Cloud API (Meta)", tag: "Ajustes → ☁️ Meta",
    steps: [
      { title: "1. Crear App en Meta Developers",
        text: "Ve a developers.facebook.com → Mis Apps → Crear App.\nTipo: Negocios → Siguiente.\nNombre: Hivo-[tuempresa] → crear app.",
        tip: "Usa el mismo correo de tu cuenta Meta Business." },
      { title: "2. Agregar producto WhatsApp",
        text: "Dentro del App → panel izquierdo → Agregar producto → WhatsApp → Configurar.\nSelecciona tu Cuenta de Meta Business." },
      { title: "3. Obtener credenciales",
        text: "Ve a WhatsApp → Configuración de API:\n• ID de número de teléfono (Phone Number ID)\n• ID de cuenta de WhatsApp Business (WABA ID)\n• Token de acceso temporal (solo 24h — para pruebas)",
        warning: "El token temporal expira en 24h. Para producción necesitas un token permanente (paso 4)." },
      { title: "4. Token permanente (OBLIGATORIO para producción)",
        text: "1. Ve a Meta Business Suite → Configuración (engranaje) → Usuarios del sistema\n2. Crear usuario del sistema → Admin\n3. Agregar activos → App → tu App → Control total\n4. Generar token → selecciona tu App\n5. Permisos: whatsapp_business_messaging + whatsapp_business_management\n6. Duración: Nunca (permanente)\n7. Copia el token generado",
        tip: "Guarda el token en un lugar seguro — no se puede recuperar después de cerrarlo." },
      { title: "5. Configurar webhook en Meta",
        text: "En tu App → WhatsApp → Configuración → Webhook:\n• URL: https://tu-dominio.railway.app/api/whatsapp/webhook\n• Token de verificación: el que configuraste en Railway como WEBHOOK_VERIFY_TOKEN\n• Suscribir a: messages",
        tip: "El dominio de Railway lo encuentras en el dashboard de tu servicio → Settings → Domain." },
      { title: "6. Pegar en Hivo",
        text: "Ajustes → ☁️ Meta/WhatsApp → proveedor: Meta Cloud API → pega:\n• Access Token\n• Phone Number ID\n• Business Account ID\n→ Guardar → probar conexión." },
    ],
  },
  {
    id: "meta-fb", icon: "📘", title: "Facebook Page + Instagram (Autopilot)", tag: "Ajustes → ☁️ Meta",
    steps: [
      { title: "Requisitos previos",
        text: "• Tener una Página de Facebook (no perfil personal)\n• Cuenta Instagram Business conectada a esa Página\n• La App de Meta Developers ya creada (paso anterior)\n• El usuario del sistema ya creado con token permanente" },
      { title: "1. Agregar permisos al token",
        text: "En Meta Business Suite → Usuarios del sistema → tu usuario → Generar nuevo token.\nAgregar permisos adicionales:\n• pages_manage_posts\n• pages_read_engagement\n• instagram_basic\n• instagram_content_publish\n→ Genera un nuevo token con todos estos permisos.",
        warning: "Si el token anterior no tiene estos permisos, genera uno nuevo con todos incluidos." },
      { title: "2. Obtener Page ID",
        text: "Ve a tu Página de Facebook → Acerca de → desplázate hasta abajo → ID de página.\nO: en la URL de tu página cuando estás como administrador." },
      { title: "3. Obtener Instagram Account ID",
        text: "Llama a esta URL en tu navegador:\nhttps://graph.facebook.com/v21.0/me/accounts?access_token=TU_TOKEN\n\nBusca tu página → copia el 'id'.\nLuego llama:\nhttps://graph.facebook.com/v21.0/ID_PAGINA?fields=instagram_business_account&access_token=TU_TOKEN\n\nCopia el 'id' dentro de instagram_business_account.",
        tip: "Puedes usar el Explorador de la API de Graph en developers.facebook.com para hacer estas llamadas fácilmente." },
      { title: "4. Pegar en Hivo",
        text: "Ajustes → ☁️ Meta/WhatsApp → sección Facebook & Instagram:\n• FB Page Token: el token permanente con todos los permisos\n• FB Page ID: el ID de tu página\n• IG Account ID: el ID de Instagram Business\n→ Guardar." },
    ],
  },
  {
    id: "google-sheets", icon: "📊", title: "Google Sheets (Sincronización)", tag: "Ajustes → 📊 Google Sheets",
    steps: [
      { title: "1. Crear proyecto en Google Cloud",
        text: "Ve a console.cloud.google.com → Crear proyecto → nombre: Hivo-Sheets.\nEn Biblioteca de APIs → busca 'Google Sheets API' → Activar.\nTambién activa 'Google Drive API'." },
      { title: "2. Crear Cuenta de Servicio",
        text: "APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio.\nNombre: hivo-sheets → Crear → Rol: Editor → Continuar → Listo.\nClic en la cuenta creada → Claves → Agregar clave → JSON → Crear.\nDescarga el archivo JSON." },
      { title: "3. Compartir tu hoja de cálculo",
        text: "Abre el JSON descargado → copia el campo 'client_email'.\nAbre tu hoja de Google Sheets → Compartir → pega ese email → Editor → Enviar.",
        warning: "Si no compartes la hoja con el email de la cuenta de servicio, la sincronización fallará." },
      { title: "4. Subir credenciales a Railway",
        text: "En Railway → Variables → Nueva variable:\nNombre: GOOGLE_SERVICE_ACCOUNT_JSON\nValor: todo el contenido del archivo JSON (incluyendo las llaves { }).\n→ Guardar → Railway reinicia automáticamente." },
      { title: "5. Configurar en Hivo",
        text: "Ajustes → 📊 Google Sheets:\n• Pega la URL completa de tu hoja de cálculo\n• Activa el switch de sincronización\n• Guardar\n→ Clic en 'Exportar ahora' para probar la primera sincronización." },
    ],
  },
  {
    id: "email", icon: "📧", title: "Email / Notificaciones (Resend)", tag: "Ajustes → 📧 Email",
    steps: [
      { title: "¿Por qué Resend y no SMTP tradicional?",
        text: "Railway bloquea los puertos SMTP tradicionales (25, 465, 587). Resend funciona por HTTPS y ofrece 3.000 emails/mes gratis.",
        tip: "Si tienes un servidor SMTP propio que no usa esos puertos, también puedes usarlo." },
      { title: "1. Crear cuenta en Resend",
        text: "Ve a resend.com → Sign up con tu email.\nVerifica tu cuenta de correo." },
      { title: "2. Obtener API Key",
        text: "En Resend → API Keys → Create API Key.\nNombre: Hivo → Permisos: Full access → Add.\nCopia la clave (empieza con 're_...').",
        warning: "La clave solo se muestra una vez. Cópiala antes de cerrar la ventana." },
      { title: "3. Configurar en Hivo",
        text: "Ajustes → 📧 Email → proveedor: Resend:\n• API Key: pega la clave 're_...'\n• Email remitente: onboarding@resend.dev (gratis) o tu dominio verificado\n• Nombre remitente: el nombre de tu empresa\n→ Guardar → Enviar email de prueba." },
      { title: "4. Activar notificaciones",
        text: "Ajustes → 🏢 Empresa → sección Notificaciones:\n• ✅ Nueva conversación\n• ✅ Pago recibido\n• ✅ Nueva reserva\n\nEl email de destino es el correo de contacto configurado en 'Email de la empresa'." },
    ],
  },
  {
    id: "openrouter", icon: "🧠", title: "OpenRouter (IA — Julieta)", tag: "Railway → Variables",
    steps: [
      { title: "¿Qué es OpenRouter?",
        text: "Plataforma que da acceso a múltiples modelos de IA (GPT-4, Claude, Llama) con una sola API. Hivo lo usa para que Julieta responda a los clientes." },
      { title: "1. Crear cuenta en OpenRouter",
        text: "Ve a openrouter.ai → Sign in with Google.\nEn Credits → Add credits (recomendado $5 para empezar).\nSin créditos puedes usar modelos gratuitos con límite de velocidad." },
      { title: "2. Obtener API Key",
        text: "OpenRouter → Keys → Create Key → nombre: Hivo.\nCopia la clave (empieza con 'sk-or-...')." },
      { title: "3. Configurar en Railway",
        text: "Railway → tu proyecto → Variables:\n• OPENROUTER_API_KEY = sk-or-...\n• OPENROUTER_MODEL = openai/gpt-4o-mini (recomendado, rápido y económico)\n→ Guardar → Railway reinicia.",
        tip: "Para mayor calidad puedes usar 'anthropic/claude-3-haiku' o 'openai/gpt-4o'. Son más costosos pero mejores." },
    ],
  },
  {
    id: "railway", icon: "🚀", title: "Railway — Deploy y Variables", tag: "railway.app",
    steps: [
      { title: "Variables de entorno obligatorias",
        text: "En Railway → tu servicio → Variables. Estas son las mínimas requeridas:\n\n• OPENROUTER_API_KEY — clave de OpenRouter\n• JWT_SECRET — cadena aleatoria larga (mínimo 32 chars)\n• MASTER_PASSWORD — contraseña del usuario master\n• WEBHOOK_VERIFY_TOKEN — token para verificar webhook de Meta\n• NEXT_PUBLIC_APP_URL — URL pública de tu app (ej: https://tu-app.railway.app)",
        warning: "Sin JWT_SECRET el sistema no puede crear sesiones. Sin MASTER_PASSWORD no puedes entrar como admin." },
      { title: "Variables opcionales pero recomendadas",
        text: "• GOOGLE_SERVICE_ACCOUNT_JSON — para Google Sheets\n• INTERNAL_SCHEDULER_KEY — para el scheduler del Autopilot (por defecto: hivo-scheduler-2026)\n• MASTER_SALT — sal del hash de la contraseña master\n• DATA_DIR — ruta al volumen persistente (por defecto: /app/data)" },
      { title: "Volumen persistente (MUY IMPORTANTE)",
        text: "Sin volumen persistente, todos los datos se pierden al reiniciar.\n\nRailway → tu servicio → Settings → Volumes → Add Volume:\n• Mount path: /app/data\n• Tamaño: 5GB (ajustable)\n→ Guardar.\n\nEl sistema guarda aquí: bases de datos SQLite, imágenes, uploads y sesiones de WhatsApp.",
        warning: "Sin volumen persistente el sistema NO funciona en producción. Es el paso más crítico." },
      { title: "Auto-deploy desde GitHub",
        text: "Railway → tu servicio → Settings → Source → Connect GitHub Repo.\nSelecciona tu repositorio → Branch: main.\nAhora cada 'git push origin main' despliega automáticamente." },
    ],
  },
  {
    id: "users", icon: "👥", title: "Usuarios y Permisos", tag: "Ajustes → 👥 Usuarios",
    steps: [
      { title: "Crear usuario de empresa",
        text: "Ajustes → 👥 Usuarios → + Nuevo usuario:\n• Usuario (login): sin espacios, ej: juan.perez\n• Nombre completo: Juan Pérez\n• Contraseña temporal: el usuario la cambia después\n→ Módulos: activa solo los que necesita ver\n→ Administrador: solo si necesita acceso total\n→ Crear." },
      { title: "Desde el Master (para cualquier empresa)",
        text: "Plataforma → 🏢 Empresas → [empresa] → 👥 Usuarios → + Nuevo usuario.\nMismos campos que arriba pero para la empresa seleccionada." },
      { title: "Permisos por módulo",
        text: "Cada módulo se activa/desactiva individualmente:\n• Chat: ver conversaciones y responder\n• CRM: pipeline de ventas\n• Calendario: reservas\n• Contabilidad: ingresos y egresos\n• Productos: catálogo\n• Analytics: métricas\n• Etc.\n\nLos módulos sin permiso no aparecen en el menú del usuario." },
      { title: "Cambiar contraseña",
        text: "Ajustes → 👥 Usuarios → clic en el usuario → botón 🔑 Cambiar contraseña.\nDesde el Master también puedes cambiar contraseñas de cualquier usuario de cualquier empresa." },
    ],
  },
  {
    id: "gateways-install", icon: "🔗", title: "Pasarelas de pago", tag: "Ajustes → 🔗 Pasarelas",
    steps: [
      { title: "Mercado Pago — Obtener credenciales",
        text: "1. Ve a mercadopago.com.co → inicia sesión con tu cuenta de negocio\n2. Tu negocio → Credenciales → Producción\n3. Copia: Public Key y Access Token\n→ Ajustes → 🔗 Pasarelas → Mercado Pago → pegar → activar → Guardar.",
        warning: "Usa siempre las credenciales de Producción, no las de Prueba (Sandbox)." },
      { title: "Wompi — Obtener llaves",
        text: "1. Ve a dashboard.wompi.co → inicia sesión\n2. Desarrolladores → Llaves de API → Producción\n3. Copia: Llave pública, Llave privada, Llave de eventos\n→ Ajustes → 🔗 Pasarelas → Wompi → pegar → activar → Guardar.",
        tip: "La llave de eventos (Integrity Key) es necesaria para verificar que los webhooks de pago son auténticos." },
    ],
  },
  {
    id: "whatsapp-qr", icon: "📱", title: "WhatsApp QR (Baileys — modo alternativo)", tag: "Ajustes → ☁️ Meta",
    steps: [
      { title: "¿Cuándo usar QR vs Meta Cloud API?",
        text: "• QR (Baileys): gratis, vincula tu número personal o Business app, sin aprobación de Meta. Más fácil de configurar pero menos estable.\n• Meta Cloud API: oficial, más estable, requiere aprobación de número en Meta. Recomendado para producción." },
      { title: "Conectar por QR",
        text: "Ajustes → ☁️ Meta/WhatsApp → proveedor: QR (Baileys).\nAbre WhatsApp o WhatsApp Business en tu celular.\n→ Dispositivos vinculados → Vincular dispositivo → escanea el QR que aparece en Hivo.",
        warning: "El número QR no puede ser el mismo que usas personalmente — todo el tráfico de ese número pasa por el sistema." },
      { title: "Número recomendado para QR",
        text: "Usa un número secundario o una SIM dedicada al negocio. Las conversaciones de WhatsApp de ese número quedarán en el sistema y no en tu celular normalmente." },
    ],
  },
];

interface Section { id: string; icon: string; title: string; content: { subtitle: string; text: string; isNew?: boolean }[] }

const SECTIONS: Section[] = [
  {
    id: "chat", icon: "💬", title: "Chat / WhatsApp",
    content: [
      { subtitle: "¿Cómo funciona el chat?", text: "El chat muestra todas las conversaciones activas de WhatsApp en tiempo real. La IA (Julieta) responde automáticamente en modo AI. Puedes tomar el control de cualquier conversación cambiando el modo." },
      { subtitle: "Modos de atención", text: "AI: Julieta responde automáticamente.\nHUMAN: Tú respondes directamente desde el sistema.\n\nNuevo: Si respondes desde tu celular (WhatsApp Business app), el sistema detecta automáticamente que tomaste el control y cambia a modo HUMAN sin que tengas que entrar al sistema.", isNew: true },
      { subtitle: "Auto-reactivación de IA (5 minutos)", text: "Si tomaste el control desde tu celular y no respondes en 5 minutos, la IA se reactiva automáticamente. Leerá toda la conversación y:\n• Si puede responder → responde de forma natural.\n• Si el tema está fuera de su alcance → envía 'Disculpa la espera, estamos revisando tu consulta...'", isNew: true },
      { subtitle: "Sincronizar nombres (botón 👤)", text: "El botón 👤 en el panel de conversaciones actualiza automáticamente todos los nombres de chats y deals del CRM desde los contactos guardados. Úsalo si hay chats sin nombre.", isNew: true },
      { subtitle: "Escanear con IA (botón 🔍)", text: "El botón 🔍 analiza todas las conversaciones activas y actualiza el estado del CRM (nombre, interés, etapa) automáticamente. Úsalo cuando haya muchas conversaciones nuevas." },
      { subtitle: "Mensajes de catálogo WhatsApp Business", text: "Si un cliente reenvía un producto de tu catálogo de WhatsApp Business, el sistema lo detecta automáticamente, extrae el nombre y precio del producto, y Julieta responde con información completa.", isNew: true },
      { subtitle: "Plantillas de mensajes", text: "En el chat puedes acceder a plantillas rápidas. Créalas en Ajustes → Plantillas. Úsalas para respuestas frecuentes como confirmaciones, precios o bienvenidas." },
    ],
  },
  {
    id: "ai", icon: "🤖", title: "Julieta — IA",
    content: [
      { subtitle: "¿Cómo aprende Julieta?", text: "Julieta aprende de dos formas:\n\n1. Aprendizaje autónomo: cada 6 mensajes de una conversación, analiza automáticamente los patrones, objeciones y preferencias detectadas.\n2. Conocimiento manual: tú agregas información específica (precios, políticas, FAQ).", isNew: true },
      { subtitle: "Ver qué ha aprendido", text: "Ve a Ajustes → Julieta IA → pestaña 'Aprendizaje autónomo'. Verás todos los patrones que detectó la IA con fecha y contenido. Puedes editar o eliminar cualquier aprendizaje.", isNew: true },
      { subtitle: "Editar aprendizajes", text: "Si Julieta aprendió algo incorrecto o quieres mejorar una respuesta, edítala directamente en Ajustes → Julieta IA. Los cambios se aplican en la próxima conversación.", isNew: true },
      { subtitle: "Recolección de datos del cliente", text: "Al iniciar cada conversación, Julieta siempre pide:\n1. Nombre completo del cliente\n2. Correo electrónico\n\nEstos datos se guardan automáticamente en Contactos y en el CRM para poder buscar por nombre.", isNew: true },
      { subtitle: "Detección automática de nombre", text: "Si el cliente menciona su nombre en cualquier parte de la conversación ('soy María', 'me llamo Carlos', 'mi nombre es...'), el sistema lo detecta y actualiza el CRM automáticamente.", isNew: true },
      { subtitle: "Instrucciones generales", text: "En Ajustes → Julieta IA defines la personalidad, tono, qué puede y no puede decir. Esta es la guía principal de comportamiento." },
      { subtitle: "Detección de cancelación", text: "Si un cliente dice 'ya no quiero', 'cancelar', 'me arrepentí', 'olvídalo' u otras frases similares, Julieta lo detecta y responde con empatía en lugar de seguir pidiendo SI o NO.", isNew: true },
    ],
  },
  {
    id: "crm", icon: "👥", title: "CRM (Pipeline de ventas)",
    content: [
      { subtitle: "¿Qué es el CRM?", text: "Pipeline visual con las etapas: NUEVO → CALIFICADO → PROPUESTA → NEGOCIACIÓN → GANADO / PERDIDO. Cada tarjeta muestra el nombre del cliente, producto de interés y valor del deal." },
      { subtitle: "Nombres en el CRM", text: "El CRM ahora muestra el nombre del cliente desde el principio. Si el cliente dio su nombre por WhatsApp, aparece en la tarjeta. Si no lo ha dado, muestra el nombre del chat de WhatsApp.", isNew: true },
      { subtitle: "Mover un lead de etapa", text: "Abre el deal y cambia la etapa desde el menú. La IA también actualiza la etapa automáticamente según el progreso de la conversación." },
      { subtitle: "Actividades y notas", text: "Registra llamadas, reuniones, notas o pagos en cada deal. Todo queda en el historial con fecha y hora." },
      { subtitle: "Tiempo en cada etapa", text: "Cada tarjeta muestra cuánto tiempo lleva el lead en esa etapa (ej: 2h, 3d). Úsalo para identificar leads estancados que necesitan seguimiento." },
      { subtitle: "Datos de contacto completos", text: "Cada tarjeta del CRM muestra:\n• Nombre del cliente\n• Email (enlace clickeable para enviar correo)\n• Teléfono (enlace clickeable que abre WhatsApp)\n• Producto de interés y valor del deal\n\nJulieta recolecta nombre, email y teléfono automáticamente durante la conversación y los guarda en el CRM.", isNew: true },
    ],
  },
  {
    id: "payments", icon: "💳", title: "Pagos y comprobantes",
    content: [
      { subtitle: "¿Cómo funciona el flujo de pago?", text: "1. Cliente envía foto del comprobante por WhatsApp.\n2. La IA lee el comprobante con visión artificial (extrae monto, banco, referencia).\n3. Aparece una alerta en el panel de Alertas.\n4. El admin aprueba el pago como completo o abono." },
      { subtitle: "Aprobar pago completo", text: "Clic en '✅ Confirmar pago completo'. El sistema: crea la reserva (confirmada), registra el ingreso en contabilidad, envía confirmación al cliente por WhatsApp con código de reserva." },
      { subtitle: "Aprobar abono (pago parcial)", text: "Clic en '📊 Registrar como abono'. Puedes ingresar el valor total del servicio para calcular el saldo. El sistema crea la reserva en estado 'pendiente' y notifica al cliente el saldo pendiente." },
      { subtitle: "Alertas por email", text: "Cuando se aprueba un pago, el administrador recibe un email con todos los detalles: cliente, servicio, monto, saldo pendiente, banco y código de reserva.", isNew: true },
    ],
  },
  {
    id: "calendar", icon: "📅", title: "Calendario / Reservas",
    content: [
      { subtitle: "Ver reservas", text: "El calendario muestra todas las reservas. Verde = confirmada, Amarillo = pendiente de pago, Gris = completada. Clic en cualquier día para ver el detalle." },
      { subtitle: "Crear una reserva manual", text: "Clic en un día o '+ Nueva reserva'. Llena nombre del cliente, servicio, fecha, personas y valor total." },
      { subtitle: "Recordatorios automáticos", text: "El sistema envía por WhatsApp:\n• Recordatorio 24h antes del servicio\n• Mensaje de seguimiento 2h después del servicio" },
      { subtitle: "Código de reserva", text: "Cada reserva genera un código único (Ej: RES-A3B7C). El cliente lo recibe por WhatsApp y puede usarlo para consultar su reserva." },
      { subtitle: "Estados de reserva", text: "Pendiente: abono recibido, falta completar pago.\nConfirmada: pago completo recibido.\nCompletada: servicio ya prestado.\nCancelada: reserva anulada." },
    ],
  },
  {
    id: "products", icon: "🛍️", title: "Productos / Servicios",
    content: [
      { subtitle: "Crear un producto", text: "Ve a Productos → Nuevo producto. Agrega nombre, descripción, precio por persona, instrucciones para la IA y fotos. La IA usará esta información para cotizar automáticamente." },
      { subtitle: "Importar desde CSV o Excel", text: "Botón '📥 Importar CSV/Excel'. Sube el archivo exportado de WhatsApp Business, Excel o cualquier sistema. El sistema detecta automáticamente las columnas de nombre, precio y descripción.", isNew: true },
      { subtitle: "Importar desde fotos con IA (iPhone)", text: "Botón '📥 Importar' → pestaña '📸 Fotos/Capturas con IA'. Sube hasta 10 fotos o capturas de pantalla de tu catálogo. La IA lee nombre, precio y descripción de cada imagen.", isNew: true },
      { subtitle: "Instrucciones especiales para la IA", text: "En el campo 'Instrucciones IA' dale indicaciones específicas: qué destacar, condiciones especiales, qué preguntar al cliente antes de cotizar." },
    ],
  },
  {
    id: "accounting", icon: "💰", title: "Contabilidad",
    content: [
      { subtitle: "Ingresos automáticos", text: "Cuando apruebas un pago de comprobante, el ingreso se registra automáticamente con: cliente, servicio, monto, tipo (completo/abono), banco, referencia y código de reserva." },
      { subtitle: "Registrar egresos", text: "Ve a Contabilidad → Egresos → + Registrar egreso. Los egresos son manuales: proveedor, categoría, descripción y monto." },
      { subtitle: "Filtros", text: "Filtra ingresos por: texto (cliente, servicio, código), tipo de pago (completo/abono/manual) y rango de fechas." },
      { subtitle: "KPIs del módulo", text: "El encabezado muestra: ingresos totales, egresos totales, margen bruto y total de abonos pendientes de completar." },
    ],
  },
  {
    id: "analytics", icon: "📊", title: "Analytics",
    content: [
      { subtitle: "¿Qué muestra?", text: "Tres grupos de KPIs:\n• Ingresos: total, este mes, tasa de conversión, tiempo promedio de cierre.\n• WhatsApp: conversaciones, activas hoy, mensajes del día, tasa de respuesta del bot <5min.\n• Reservas: total, confirmadas, pendientes de pago, completadas.", isNew: true },
      { subtitle: "Horas pico de mensajes", text: "Gráfico de 24 horas mostrando cuándo el bot recibe más mensajes (en hora Colombia). Útil para saber cuándo están activos tus clientes.", isNew: true },
      { subtitle: "Próximas reservas", text: "Panel con las reservas de los próximos 7 días: cliente, servicio, fecha, personas y estado.", isNew: true },
      { subtitle: "Rentabilidad por producto", text: "Tabla con ventas, ingresos totales y promedio de personas por producto. Identifica cuál producto genera más ingresos." },
    ],
  },
  {
    id: "settings", icon: "⚙️", title: "Ajustes",
    content: [
      { subtitle: "Empresa", text: "Nombre, teléfono, correo de contacto (destinatario de alertas), logo, horario de atención del bot, números Nequi/Daviplata.\n\nEl correo de contacto es donde llegarán las alertas de nuevas conversaciones, pagos y reservas." },
      { subtitle: "WhatsApp — Conectar QR", text: "Ve a Ajustes → WhatsApp. Muestra el estado de la conexión, el QR para escanear si está desconectado, y el número vinculado. Puedes desconectar desde aquí.", isNew: true },
      { subtitle: "Notificaciones por email", text: "En la pestaña Empresa, activa o desactiva las alertas por email para:\n• Nueva conversación\n• Pago aprobado\n• Nueva reserva\n\nRequiere SMTP o Resend configurado.", isNew: true },
      { subtitle: "Email SMTP — Resend (recomendado)", text: "Railway bloquea los puertos SMTP tradicionales. Usa Resend (resend.com) gratis (3.000 emails/mes). Crea cuenta, genera API Key y pégala en Ajustes → Email SMTP → Resend. El email remitente debe ser onboarding@resend.dev.", isNew: true },
      { subtitle: "Julieta IA", text: "Define nombre, personalidad y conocimiento de tu IA. Ve la sección 🧠 Aprendizaje autónomo para ver qué ha aprendido Julieta de las conversaciones." },
      { subtitle: "Google Drive", text: "Conecta hojas de cálculo de Google Drive para que Julieta consulte información dinámica en tiempo real (tarifas, disponibilidad, reservas)." },
      { subtitle: "Usuarios y permisos", text: "Crea usuarios para tu equipo. Cada usuario tiene módulos específicos activados. Los módulos sin permiso no aparecen en el menú. Puedes editar nombre, contraseña y permisos de cualquier usuario.", isNew: true },
    ],
  },
  {
    id: "whatsapp", icon: "📱", title: "WhatsApp (Conexión QR)",
    content: [
      { subtitle: "Primera conexión", text: "Ve a Ajustes → WhatsApp. Abre WhatsApp Business en tu celular → Dispositivos vinculados → Vincular dispositivo. Escanea el QR." },
      { subtitle: "Número recomendado", text: "Usa un número exclusivo para el sistema. Se recomienda una SIM dedicada o número secundario. No uses tu número personal ya que todas las conversaciones del negocio pasarán por aquí." },
      { subtitle: "Responder desde tu celular", text: "Puedes responder desde la app de WhatsApp en tu celular cuando quieras. El sistema detecta tu respuesta y pausa la IA automáticamente. Si no respondes en 5 minutos, la IA retoma sola.", isNew: true },
      { subtitle: "Desconexión", text: "En Ajustes → WhatsApp → botón Desconectar. El bot dejará de funcionar hasta que vuelvas a escanear el QR." },
    ],
  },
  {
    id: "multicompany", icon: "🏢", title: "Plataforma Master",
    content: [
      { subtitle: "¿Qué es el panel Master?", text: "Accedes con el usuario Master. Desde aquí gestionas todas las empresas, sus planes, pagos y configuraciones globales. La plataforma tiene 6 secciones accesibles desde las pestañas superiores." },
      { subtitle: "📊 Métricas (primera pestaña)", text: "Vista ejecutiva del negocio en tiempo real:\n• MRR (ingresos recurrentes mensuales)\n• ARR (ingresos anualizados)\n• Churn mensual (empresas que se dan de baja)\n• Nuevas empresas este mes\n• Ingresos por plan con gráfico de barras\n• Top empresas por valor y actividad de conversaciones", isNew: true },
      { subtitle: "🏢 Empresas", text: "Lista de todas las empresas. Puedes:\n• Crear nueva empresa con su admin\n• Editar datos, plan y estado\n• Gestionar usuarios y permisos\n• Activar/suspender\n• Configurar extensiones (Autopilot y Modo Admin) por empresa", isNew: true },
      { subtitle: "📋 Planes", text: "Define los planes de suscripción con sus módulos, precios en COP y USD, y límites de usuarios/números WhatsApp." },
      { subtitle: "💳 Pagos", text: "Historial de pagos y suscripciones. Aprueba pagos pendientes para activar empresas." },
      { subtitle: "⚙️ Ajustes", text: "Configuración global de la plataforma: credenciales de pasarelas de pago (Mercado Pago y Wompi). Solo actívalas cuando estés listo para cobros en línea.", isNew: true },
      { subtitle: "🧠 Equipo IA — con acciones reales", text: "5 agentes especializados que pueden responder preguntas Y ejecutar acciones reales:\n• Asistente: suspender/activar empresas, ver estadísticas, cerrar tickets\n• Dev Lead: arquitectura y bugs del sistema\n• Project Manager: roadmap y prioridades\n• Marketing: estrategia y contenido\n• Sales: ventas y pricing\n\nEjemplos de acciones que puedes pedirle:\n'Dame las stats de beachland'\n'Suspende la empresa ejemplo'\n'Cierra el ticket #5'", isNew: true },
      { subtitle: "Autopilot por empresa", text: "Plataforma → Empresas → clic en Usuarios → al fondo verás la extensión Autopilot. Actívala para que la empresa vea el módulo en su menú.", isNew: true },
      { subtitle: "Modo Admin WhatsApp por empresa", text: "Plataforma → Empresas → Usuarios → al fondo verás 🔧 Modo Admin. Configura el número del dueño (con código de país, ej: 573001234567) y la palabra clave secreta. Esta configuración solo es visible para el Master.", isNew: true },
      { subtitle: "Auto-registro", text: "Las empresas pueden registrarse solas en /register. Quedan en estado 'Pendiente' hasta que las actives." },
      { subtitle: "Aislamiento de datos", text: "Cada empresa tiene su propia base de datos completamente aislada. Nunca pueden ver los datos de otra empresa." },
    ],
  },
  {
    id: "autopilot", icon: "🤖", title: "Autopilot — Redes sociales",
    content: [
      { subtitle: "¿Qué es el Autopilot?", text: "Módulo de publicación automática en Facebook e Instagram. Genera contenido con IA basado en tus productos y servicios, y lo publica automáticamente según la frecuencia que configures.\n\nEs una extensión de pago — el administrador de la plataforma debe activarla para tu empresa desde Plataforma → Empresas → tu empresa → Extensión Autopilot.", isNew: true },
      { subtitle: "Banco de imágenes (pestaña 🖼️)", text: "Sube las fotos de tus servicios en Autopilot → Banco de imágenes. Puedes arrastrar para cambiar el orden. El sistema las usa en ese orden de forma rotativa en cada publicación.\n\nSin imágenes cargadas, el Autopilot no puede publicar.", isNew: true },
      { subtitle: "Cola de publicación (pestaña 📋)", text: "Aquí se acumulan los posts generados con IA esperando aprobación.\n\n• Aprobar: marca el post como listo para publicar\n• 🚀 Publicar ahora: lo envía a Facebook e Instagram inmediatamente\n• Eliminar: descarta el post\n\nEl sistema usa las credenciales Meta configuradas en Ajustes → ☁️ Meta.", isNew: true },
      { subtitle: "Generar contenido con IA", text: "Clic en '✨ Generar post'. La IA crea el texto del post basado en:\n• Tu catálogo de productos con precios reales\n• El tono configurado (Profesional/Casual/Entretenido/Informativo)\n\nPuedes usar un prompt personalizado para indicar el tema del post. El texto se puede editar antes de aprobar.", isNew: true },
      { subtitle: "Publicados (pestaña ✅) — Fase 3", text: "Muestra el historial de posts publicados con:\n• Fecha y hora de publicación\n• Likes en Facebook e Instagram\n• Botón 🔄 Actualizar stats: refresca los likes desde Meta\n• Botón 🚀 Impulsar: te lleva directo a Meta Ads Manager para poner presupuesto publicitario al post. Hivo no maneja dinero — tú lo gestionas directamente con Meta.", isNew: true },
      { subtitle: "Cómo funciona el modo automático", text: "El modo automático se configura en Autopilot → ⚙️ Configuración:\n\n1. Activa 'Publicación automática' (interruptor al final)\n2. Elige la frecuencia: 1/día, 5/semana, 3/semana o 1/semana\n3. Elige la hora de publicación\n4. Guarda la configuración\n\n¿Qué hace el sistema?\nCada hora, el sistema revisa si ya es tiempo de publicar según tu frecuencia. Cuando llega el momento:\n• Toma la siguiente imagen del banco (en orden)\n• Genera el texto con IA automáticamente\n• Publica en Facebook e Instagram sin que hagas nada\n\nImportante: debes tener imágenes cargadas en el banco y la extensión Autopilot activa.", isNew: true },
      { subtitle: "Requerimientos", text: "• Facebook Page configurada en Ajustes → ☁️ Meta\n• Cuenta Instagram Business conectada a esa Página\n• Imágenes subidas al banco de Autopilot\n• Extensión Autopilot activa (la activa el administrador de Hivo)" },
    ],
  },
  {
    id: "tickets", icon: "🎫", title: "Soporte y Tickets",
    content: [
      { subtitle: "¿Para qué sirve?", text: "Sistema de soporte técnico entre tu empresa y el equipo de Hivo. Si tienes un problema, duda o sugerencia, crea un ticket y recibirás respuesta directa.", isNew: true },
      { subtitle: "Crear un ticket", text: "Soporte → + Nuevo. Completa:\n• Asunto: descripción breve del problema\n• Categoría: Soporte técnico, Facturación, Configuración, etc.\n• Prioridad: Baja / Media / Alta / Crítica\n• Descripción: detalla el problema con todo el contexto posible", isNew: true },
      { subtitle: "Estados del ticket", text: "Abierto → En revisión → Resuelto → Cerrado.\nTe notificaremos por email cuando el equipo responda." },
      { subtitle: "Chat interno", text: "Dentro de cada ticket hay un chat. Puedes enviar mensajes adicionales, capturas o contexto. El equipo de Hivo responde directamente ahí.", isNew: true },
    ],
  },
  {
    id: "admin-mode", icon: "🔧", title: "Modo Admin por WhatsApp",
    content: [
      { subtitle: "¿Qué es?", text: "Función premium que permite al dueño consultar datos del negocio desde su WhatsApp personal usando una palabra clave secreta. Julieta responde con datos reales de la base de datos.", isNew: true },
      { subtitle: "¿Cómo activarlo?", text: "El administrador de Hivo debe activarlo desde el panel Master → Empresas → tu empresa → 🔧 Modo Admin. Configura tu número (con código de país, ej: 573001234567) y una palabra clave secreta.", isNew: true },
      { subtitle: "Usar el modo admin", text: "Escribe la palabra clave en tu WhatsApp al número de la empresa. Julieta responde confirmando que estás en modo admin.\n\nPuedes preguntar cualquier cosa en lenguaje natural:\n• '¿Cuánto ingresé este mes?'\n• '¿Hay reservas para mañana?'\n• '¿Qué clientes deben dinero?'\n• 'Dame un resumen del negocio'\n\nJulieta tiene acceso en tiempo real a reservas, contabilidad, CRM, conversaciones y productos.", isNew: true },
      { subtitle: "Salir del modo admin", text: "Escribe la misma palabra clave de nuevo → Julieta desactiva el modo y vuelve a atender clientes normalmente." },
      { subtitle: "Privacidad", text: "Las conversaciones en modo admin son completamente invisibles en el sistema. No aparecen en el módulo de Chat ni en el historial. Solo tú las ves en tu WhatsApp.", isNew: true },
    ],
  },
  {
    id: "reservations", icon: "📅", title: "Reservas y Pagos",
    content: [
      { subtitle: "Crear reserva manual", text: "Calendario → + Nueva reserva. Selecciona el servicio del catálogo y el precio se llena automáticamente. Calcula: precio × personas − descuento = total. Puedes registrar un abono inicial.", isNew: true },
      { subtitle: "Registrar un pago", text: "En la vista de lista o calendario, las reservas con saldo pendiente muestran el botón '+ Pago'. Al hacer clic, ingresa el monto y la referencia. El pago se registra en contabilidad automáticamente.", isNew: true },
      { subtitle: "Recibo PDF", text: "Cada reserva tiene su recibo PDF accesible desde el botón 'PDF'. El QR del recibo apunta a la URL pública del recibo — el cliente puede escanearlo para ver y compartir su comprobante.", isNew: true },
      { subtitle: "Sincronización con Google Sheets", text: "Activa en Ajustes → 📊 Google Sheets. Cada reserva creada o actualizada se sincroniza automáticamente con tu hoja de cálculo.", isNew: true },
      { subtitle: "Flujo automático con Julieta", text: "Cuando el cliente envía un comprobante por WhatsApp:\n1. Julieta extrae el monto con IA\n2. Confirma con el cliente\n3. Genera alerta para el admin\n4. Admin aprueba/rechaza\n5. Si aprueba: reserva confirmada + recibo PDF enviado al cliente automáticamente", isNew: true },
    ],
  },
];

export default function HelpModule() {
  const [mode, setMode] = useState<"uso"|"instalacion">("uso");
  const [activeSection, setActiveSection] = useState<string>("chat");
  const [activeInstall, setActiveInstall] = useState<string>("meta-wa");

  const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];
  const currentInstall = INSTALL_SECTIONS.find(s => s.id === activeInstall) ?? INSTALL_SECTIONS[0];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Selector de modo */}
      <div className="shrink-0 flex gap-2 px-4 py-3 border-b bg-white">
        <button onClick={() => setMode("uso")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "uso" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
          📖 Manual de uso
        </button>
        <button onClick={() => setMode("instalacion")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${mode === "instalacion" ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
          🔧 Manual de instalación
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── MODO USO ── */}
        {mode === "uso" && (
          <>
            <aside className="w-52 shrink-0 bg-gray-50 border-r overflow-y-auto py-3">
              <div className="px-4 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Módulos del sistema</p>
              </div>
              {SECTIONS.map(s => (
                <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${activeSection === s.id ? "bg-emerald-50 text-emerald-700 font-medium border-r-2 border-emerald-500" : "text-gray-600 hover:bg-gray-100"}`}>
                  <span>{s.icon}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </aside>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-3xl">
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3 mb-6">
                <span className="text-3xl">{current.icon}</span>
                {current.title}
              </h1>
              <div className="space-y-4">
                {current.content.map((item, i) => (
                  <div key={i} className={`border rounded-xl p-5 ${item.isNew ? "bg-emerald-50 border-emerald-200" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-gray-800">{item.subtitle}</h3>
                      {item.isNew && <span className="shrink-0 text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-semibold">Nuevo</span>}
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-700">¿Necesitas ayuda? Escríbenos por WhatsApp al <strong>+57 300 6259725</strong> — soporte en horario laboral.</p>
              </div>
            </div>
          </>
        )}

        {/* ── MODO INSTALACIÓN ── */}
        {mode === "instalacion" && (
          <>
            <aside className="w-56 shrink-0 bg-gray-50 border-r overflow-y-auto py-3">
              <div className="px-4 mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">APIs & Configuración</p>
              </div>
              {INSTALL_SECTIONS.map(s => (
                <button key={s.id} onClick={() => setActiveInstall(s.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-gray-100 ${activeInstall === s.id ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-500" : "text-gray-600 hover:bg-gray-100"}`}>
                  <div className="flex items-center gap-2">
                    <span>{s.icon}</span>
                    <span className="truncate font-medium">{s.title}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-6">{s.tag}</p>
                </button>
              ))}
            </aside>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-3xl">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-3xl">{currentInstall.icon}</span>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">{currentInstall.title}</h1>
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{currentInstall.tag}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {currentInstall.steps.map((step, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-800 mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{step.text}</p>
                    {step.warning && (
                      <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-orange-700">⚠️ {step.warning}</p>
                      </div>
                    )}
                    {step.tip && (
                      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-blue-700">💡 {step.tip}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <p className="text-sm text-indigo-700">¿Algo no funciona? Crea un ticket en <strong>Soporte</strong> con el mensaje de error exacto y te ayudamos.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
