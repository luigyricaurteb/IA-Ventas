"use client";

import { useState } from "react";

interface Section {
  id: string;
  icon: string;
  title: string;
  content: { subtitle: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "chat",
    icon: "💬",
    title: "Chat / WhatsApp",
    content: [
      {
        subtitle: "¿Cómo funciona el chat?",
        text: "El chat muestra todas las conversaciones activas de WhatsApp. La IA (Julieta) responde automáticamente en modo AI. Puedes tomar el control de cualquier conversación cambiando el modo a HUMAN.",
      },
      {
        subtitle: "Modos de atención",
        text: "AI: Julieta responde automáticamente siguiendo el flujo configurado.\nHUMAN: Tú respondes directamente. Julieta no intervendrá hasta que vuelvas a activar AI.\nPara cambiar: abre la conversación y usa el botón de modo en la parte superior.",
      },
      {
        subtitle: "Escanear con IA",
        text: "El botón '🔍 Escanear' analiza todas las conversaciones activas y actualiza el estado del CRM (nombre, interés, etapa) automáticamente. Úsalo cuando haya muchas conversaciones nuevas.",
      },
      {
        subtitle: "Plantillas de mensajes",
        text: "En el chat puedes acceder a plantillas rápidas. Créalas en Ajustes → Empresa. Úsalas para respuestas frecuentes como confirmaciones, precios o bienvenidas.",
      },
    ],
  },
  {
    id: "crm",
    icon: "👥",
    title: "CRM (Embudo de ventas)",
    content: [
      {
        subtitle: "¿Qué es el CRM?",
        text: "El CRM muestra los contactos organizados en etapas del proceso de venta: NUEVO → CALIFICADO → PROPUESTA → NEGOCIACIÓN → GANADO / PERDIDO.",
      },
      {
        subtitle: "Mover un contacto de etapa",
        text: "Arrastra la tarjeta de un contacto de una columna a otra, o abre el contacto y cambia la etapa desde el menú.",
      },
      {
        subtitle: "Lead Score",
        text: "Cada contacto tiene un puntaje de 0 a 100 calculado automáticamente por la IA según el nivel de interés demostrado en la conversación. Mayor puntaje = mayor probabilidad de cierre.",
      },
      {
        subtitle: "Actividades",
        text: "Puedes registrar llamadas, reuniones o notas en cada deal. Esto queda en el historial del contacto.",
      },
    ],
  },
  {
    id: "calendar",
    icon: "📅",
    title: "Calendario / Reservas",
    content: [
      {
        subtitle: "Ver reservas",
        text: "El calendario muestra todas las reservas agendadas. Cada reserva tiene estado: Pendiente, Confirmada, Completada o Cancelada.",
      },
      {
        subtitle: "Crear una reserva",
        text: "Haz clic en un día del calendario o usa el botón '+ Nueva reserva'. Llena el nombre del cliente, servicio, fecha, número de personas y valor.",
      },
      {
        subtitle: "Recordatorios automáticos",
        text: "El sistema envía automáticamente un recordatorio por WhatsApp 24 horas antes de cada servicio, y un mensaje de seguimiento 24 horas después.",
      },
      {
        subtitle: "Código de reserva",
        text: "Cada reserva genera un código único (Ej: RES-A3B7C). El cliente puede usarlo para consultar el estado de su reserva por WhatsApp.",
      },
    ],
  },
  {
    id: "products",
    icon: "🛍️",
    title: "Productos / Servicios",
    content: [
      {
        subtitle: "Crear un producto",
        text: "Ve a Productos → Nueva producto. Agrega nombre, descripción, precio por persona y fotos. La IA usará esta información para presentar los productos a los clientes por WhatsApp.",
      },
      {
        subtitle: "Fotos del producto",
        text: "Puedes subir múltiples fotos (JPG, PNG). Cuando el cliente pregunta por un producto, la IA envía las fotos automáticamente por WhatsApp.",
      },
      {
        subtitle: "Instrucciones especiales para la IA",
        text: "En el campo 'Instrucciones IA' puedes darle indicaciones específicas sobre cómo presentar ese producto: qué destacar, qué no mencionar, condiciones especiales, etc.",
      },
      {
        subtitle: "Conectar con proveedores",
        text: "Puedes vincular proveedores a un producto para tener registro de quién presta el servicio. Ve a Proveedores, crea el proveedor y asócialo al producto.",
      },
    ],
  },
  {
    id: "accounting",
    icon: "💰",
    title: "Contabilidad",
    content: [
      {
        subtitle: "Ingresos y gastos",
        text: "El módulo registra ingresos (ventas, cobros) y gastos (proveedores, operaciones). Puedes filtrar por fecha y ver el balance.",
      },
      {
        subtitle: "Vincular con reservas",
        text: "Cuando confirmas un pago en una reserva, el ingreso se registra automáticamente en contabilidad.",
      },
      {
        subtitle: "Exportar",
        text: "Puedes exportar los registros a CSV para importarlos en tu software de contabilidad.",
      },
    ],
  },
  {
    id: "suppliers",
    icon: "🤝",
    title: "Proveedores",
    content: [
      {
        subtitle: "Gestión de proveedores",
        text: "Registra todos tus proveedores con RNT, NIT, contacto, cuentas bancarias y documentos (contratos, tarifas, RUT).",
      },
      {
        subtitle: "Documentos del proveedor",
        text: "Sube PDF, Word o imágenes directamente al perfil del proveedor. Todos los documentos quedan centralizados.",
      },
      {
        subtitle: "Asociar a productos",
        text: "Vincula proveedores a los productos que ellos ejecutan para tener trazabilidad completa de cada servicio.",
      },
    ],
  },
  {
    id: "campaigns",
    icon: "📧",
    title: "Campañas de email",
    content: [
      {
        subtitle: "¿Qué son las campañas?",
        text: "Permite enviar correos masivos a tus contactos. Ideal para promociones, novedades o seguimiento post-venta.",
      },
      {
        subtitle: "Crear una campaña",
        text: "Ve a Campañas → Nueva. Define el asunto, el cuerpo del correo (HTML o texto) y el segmento de contactos (por etapa del CRM).",
      },
      {
        subtitle: "Configurar email",
        text: "Primero configura tu servidor SMTP en Ajustes → Email SMTP. Sin esto, los correos no se enviarán.",
      },
      {
        subtitle: "Desuscripciones",
        text: "Los contactos que soliciten no recibir más correos son marcados automáticamente y excluidos de futuras campañas.",
      },
    ],
  },
  {
    id: "documents",
    icon: "📄",
    title: "Documentos legales",
    content: [
      {
        subtitle: "Tratamiento de datos",
        text: "El módulo de documentos gestiona la Política de Tratamiento de Datos. La IA solicita autorización al cliente al inicio de cada conversación.",
      },
      {
        subtitle: "Versiones",
        text: "Puedes crear nuevas versiones del documento. El sistema guarda un registro de cuándo cada cliente aceptó (nombre, teléfono, fecha y versión).",
      },
      {
        subtitle: "Registro de consentimiento",
        text: "Cada aceptación queda guardada con la conversación del cliente. Esto es tu respaldo legal en caso de auditoría.",
      },
    ],
  },
  {
    id: "analytics",
    icon: "📊",
    title: "Analytics",
    content: [
      {
        subtitle: "¿Qué muestra Analytics?",
        text: "Métricas de conversaciones, tasa de conversión por etapa, tiempo promedio de respuesta, productos más consultados y satisfacción del cliente (CSAT).",
      },
      {
        subtitle: "CSAT (Satisfacción)",
        text: "Después de cerrar cada conversación, la IA puede enviar automáticamente una encuesta de satisfacción de 1 a 5. Los resultados aparecen en Analytics.",
      },
    ],
  },
  {
    id: "settings",
    icon: "⚙️",
    title: "Ajustes",
    content: [
      {
        subtitle: "Empresa",
        text: "Configura nombre, teléfono, correo, logo, horario de atención del bot y números de pago (Nequi/Daviplata).",
      },
      {
        subtitle: "Cuentas bancarias",
        text: "Agrega las cuentas bancarias que aparecerán en el voucher PDF que se le envía al cliente.",
      },
      {
        subtitle: "Email SMTP",
        text: "Configura el servidor de correo para enviar campañas. Compatible con Gmail (usa contraseña de aplicación), Outlook y otros.",
      },
      {
        subtitle: "Julieta IA",
        text: "Define la personalidad, tono y restricciones de la IA. También puedes agregar conocimiento específico: tarifas, políticas, preguntas frecuentes.",
      },
      {
        subtitle: "Google Drive",
        text: "Conecta hojas de cálculo o documentos de Google Drive para que la IA tenga acceso en tiempo real a información dinámica como reservas, tarifas o disponibilidad.",
      },
      {
        subtitle: "Usuarios",
        text: "Crea usuarios para tu equipo y define exactamente qué módulos puede ver cada uno usando los switches de permisos. Los módulos sin permiso no aparecen en el menú.",
      },
    ],
  },
  {
    id: "whatsapp",
    icon: "📱",
    title: "WhatsApp (Conexión QR)",
    content: [
      {
        subtitle: "Primera conexión",
        text: "Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo. Escanea el QR que aparece en pantalla.",
      },
      {
        subtitle: "¿El QR expiró?",
        text: "Haz clic en el botón '¿Expiró? Haz click para obtener un nuevo QR'. El sistema solicitará un QR fresco al servidor.",
      },
      {
        subtitle: "Desconexión",
        text: "Si tu teléfono pierde conexión o WhatsApp cierra la sesión, el sistema lo detectará y te mostrará el QR nuevamente para volver a vincular.",
      },
      {
        subtitle: "Número de WhatsApp",
        text: "Usa un número exclusivo para el sistema. No uses tu número personal ya que todas las conversaciones pasarán por aquí.",
      },
    ],
  },
];

export default function HelpModule() {
  const [activeSection, setActiveSection] = useState<string>("chat");

  const current = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0];

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar de secciones */}
      <aside className="w-56 shrink-0 bg-gray-50 border-r overflow-y-auto py-4">
        <div className="px-4 mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Manual de usuario</p>
        </div>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${activeSection === s.id ? "bg-emerald-50 text-emerald-700 font-medium border-r-2 border-emerald-500" : "text-gray-600 hover:bg-gray-100"}`}>
            <span>{s.icon}</span>
            {s.title}
          </button>
        ))}
      </aside>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <span className="text-3xl">{current.icon}</span>
            {current.title}
          </h1>
        </div>

        <div className="space-y-6">
          {current.content.map((item, i) => (
            <div key={i} className="bg-white border rounded-xl p-5">
              <h3 className="font-semibold text-gray-800 mb-2">{item.subtitle}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-sm text-emerald-700">
            ¿No encuentras lo que buscas? Contacta con soporte o consulta a tu administrador de sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
