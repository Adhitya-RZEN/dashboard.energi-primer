import { auth } from "@/auth";
import { isDashboardRole } from "@/lib/authorization-policy";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (isDashboardRole(session?.user?.role)) redirect("/dashboard");
  if (session) redirect("/login?error=unauthorized");
  redirect("/login");
}
