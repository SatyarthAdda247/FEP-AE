import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "eduskill_admin" || user.role === "eduskill_manager" || user.role === "eduskill_viewer") redirect("/manager");
  redirect("/faculty");
}
