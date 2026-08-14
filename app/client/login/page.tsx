import type { Metadata } from "next";
import { companyLegal, legalRoutes } from "@/lib/company-legal";
import { CLIENT_PAYMENT_PORTAL_ENABLED } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Client portal | My Derm Lounge",
  robots: { index: false, follow: false },
};

export default function ClientPortalLoginPage() {
  if (CLIENT_PAYMENT_PORTAL_ENABLED) {
    return null;
  }

  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="max-w-md mx-auto px-5 py-16">
        <h1 className="font-serif text-3xl text-brand mb-3">
          Client payment portal
        </h1>
        <p className="text-gray-600 mb-6">
          Online payments and saved cards are not available. Please call{" "}
          <a
            className="text-accent hover:underline"
            href={`tel:${companyLegal.businessPhone}`}
          >
            {companyLegal.businessPhoneDisplay}
          </a>{" "}
          or use our{" "}
          <a className="text-accent hover:underline" href={legalRoutes.contact}>
            contact form
          </a>
          .
        </p>
        <p>
          <a className="text-accent hover:underline" href="/">
            Back to My Derm Lounge
          </a>
        </p>
      </div>
    </main>
  );
}
