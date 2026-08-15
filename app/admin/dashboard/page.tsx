import { redirect } from "next/navigation";
import { getSession } from "@/lib/scheduling/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";
import { parseAdminTab } from "@/lib/admin/tabs";

export const metadata = {
  title: "Staff Dashboard | My Derm Lounge",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session.user || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  const { tab } = await searchParams;
  const initialTab = parseAdminTab(tab);
  if (initialTab === "metaAds") {
    redirect("/admin/meta-ads/");
  }

  return <AdminDashboard initialTab={initialTab} />;
}
