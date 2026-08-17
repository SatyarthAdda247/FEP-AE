import { redirect } from "next/navigation";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getCurrentUser } from "@/lib/auth";
import { ddb, TABLES } from "@/lib/dynamodb";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { GlobalUploadFab } from "@/components/GlobalUploadFab";
import type { User } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Force onboarding to completion before any dashboard page is usable
  if (!user.userId.startsWith("viewer:")) {
    const res = await ddb.send(new GetCommand({ TableName: TABLES.USERS, Key: { userId: user.userId } }));
    const dbUser = res.Item as User | undefined;
    if (dbUser && dbUser.profileComplete === false) redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav userName={user.name} role={user.role} />
      {/* pb clears the mobile bottom tab bar */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <GlobalUploadFab />
      <BottomNav role={user.role} />
    </div>
  );
}
