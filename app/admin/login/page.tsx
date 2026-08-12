import SchedulingLoginForm from "@/components/scheduling/SchedulingLoginForm";

export const metadata = {
  title: "Staff Login | My Derm Lounge",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AdminLoginPage() {
  return (
    <SchedulingLoginForm
      role="admin"
      title="Staff login"
      subtitle="Sign in to manage leads, conversations, and opportunities."
      loginPath="/admin/login"
      dashboardPath="/admin/dashboard"
    />
  );
}
