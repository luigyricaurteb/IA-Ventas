import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";

export default async function Home() {
  // Si ya tiene sesión activa → ir al dashboard
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;
  if (token) redirect("/dashboard");

  return <LandingPage />;
}
