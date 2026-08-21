import { redirect } from "next/navigation";
import { getSession } from "@/lib/scheduling/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const metadata = {
  title: "Meta Ads | My Derm Lounge",
  robots: { index: false, follow: false },
};

export default async function AdminMetaAdsPage() {
  const session = await getSession();
  if (!session.user || session.user.role !== "admin") {
    redirect("/admin/login/");
  }

  return <AdminDashboard initialTab="metaAds" />;
}
