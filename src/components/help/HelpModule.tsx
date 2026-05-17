"use client";
import { useState } from "react";

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
    id: "multicompany", icon: "🏢", title: "Multi-empresa (Master)",
    content: [
      { subtitle: "¿Qué es el panel Master?", text: "Si eres el administrador de la plataforma, accedes con el usuario Master. Desde aquí gestionas todas las empresas afiliadas, sus planes, suscripciones y usuarios." },
      { subtitle: "Crear una empresa", text: "Master → Empresas → + Nueva empresa. Define nombre, slug (identificador único), NIT, plan, y crea el usuario administrador de esa empresa." },
      { subtitle: "Planes y módulos", text: "En Master → Planes defines qué módulos incluye cada plan. Ajustes y Suscripción siempre están disponibles para los admins sin importar el plan." },
      { subtitle: "Aislamiento de datos", text: "Cada empresa tiene su propia base de datos completamente aislada. Una empresa nunca puede ver los datos de otra. Los archivos (comprobantes, imágenes) también están separados por empresa." },
      { subtitle: "Suscripciones", text: "En Master → Pagos ves las solicitudes de suscripción. Aprueba el pago para activar la empresa o extender su plan." },
    ],
  },
];

export default function HelpModule() {
  const [activeSection, setActiveSection] = useState<string>("chat");
  const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-gray-50 border-r overflow-y-auto py-3">
        <div className="px-4 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Manual de usuario</p>
        </div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${activeSection === s.id ? "bg-emerald-50 text-emerald-700 font-medium border-r-2 border-emerald-500" : "text-gray-600 hover:bg-gray-100"}`}>
            <span>{s.icon}</span>
            <span className="truncate">{s.title}</span>
          </button>
        ))}
      </aside>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <span className="text-3xl">{current.icon}</span>
            {current.title}
          </h1>
        </div>

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
          <p className="text-sm text-blue-700">
            ¿Necesitas ayuda? Escríbenos por WhatsApp al <strong>+57 300 6259725</strong> — soporte en horario laboral.
          </p>
        </div>
      </div>
    </div>
  );
}
