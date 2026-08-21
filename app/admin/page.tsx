import { redirect } from "next/navigation";
import { getSession } from "@/lib/scheduling/auth";

export const metadata = {
  title: "Staff Portal | My Derm Lounge",
  robots: { index: false, follow: false },
};

/** Entry URL linked from Meta OAuth and in-app copy — send staff to login or dashboard. */
export default async function AdminPortalPage() {
  const session = await getSession();
  if (session.user?.role === "admin") {
    redirect("/admin/dashboard/");
  }
  redirect("/admin/login/");
}
