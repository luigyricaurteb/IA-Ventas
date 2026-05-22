"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PaymentSuccessContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "approved" | "pending" | "failed">("loading");

  useEffect(() => {
    const txStatus = params.get("id") ? "approved" : "pending";
    // Wompi devuelve ?id=TX_ID cuando el pago fue exitoso
    const id = params.get("id");
    if (id) {
      // Verificar estado de la transacción (Wompi también envía webhook, esto es solo UI)
      setStatus("approved");
    } else {
      setStatus("pending");
    }
  }, [params]);

  if (status === "loading") {
    return <div className="text-white text-center">Verificando pago...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0f172a" }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-10 text-center">
        {status === "approved" ? (
          <>
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Pago confirmado!</h2>
            <p className="text-gray-500 mb-4">
              Tu cuenta está siendo activada. En unos minutos recibirás un correo con tus credenciales de acceso.
            </p>
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-blue-800 font-semibold">¿Qué sigue?</p>
              <ul className="mt-2 space-y-1 text-sm text-blue-700">
                <li>✅ Recibirás un email con tu usuario y contraseña</li>
                <li>✅ Ingresa en aivoxgroup.com/login</li>
                <li>✅ El asistente te guiará paso a paso</li>
              </ul>
            </div>
            <a href="/login" className="inline-block text-white px-6 py-3 rounded-xl font-semibold" style={{ background: "#0077b6" }}>
              Ir al login →
            </a>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Procesando tu pago</h2>
            <p className="text-gray-500 mb-4">
              Tu pago está siendo procesado. Te enviaremos un correo cuando tu cuenta esté activa.
            </p>
            <p className="text-sm text-gray-400">
              ¿Tienes preguntas? <a href="mailto:hola@aivoxgroup.com" className="text-blue-500">hola@aivoxgroup.com</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
        <p className="text-white">Verificando pago...</p>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
