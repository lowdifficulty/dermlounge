import type { Metadata } from "next";
import { companyLegal, legalRoutes } from "@/lib/company-legal";

export const metadata: Metadata = {
  title: "Data Deletion Instructions | My Derm Lounge",
  description:
    "How to request deletion of personal data My Derm Lounge collected from our website, SMS, CRM, or Facebook / Instagram Lead Ads.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/data-deletion/" },
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="max-w-2xl mx-auto px-5 py-14 md:py-20">
        <p className="text-sm text-gray-500 mb-6">
          <a href="/" className="text-accent hover:underline">
            My Derm Lounge
          </a>
        </p>
        <h1 className="font-serif text-3xl md:text-4xl text-brand mb-4">
          Data deletion instructions
        </h1>
        <p className="text-gray-600 mb-8">
          Use this page to request that {companyLegal.name} delete personal
          information we hold about you, including data from our website,
          SMS/CRM, and Facebook or Instagram Lead Ads (Meta).
        </p>

        <section className="space-y-4 mb-10">
          <h2 className="font-serif text-xl text-brand">How to request deletion</h2>
          <ol className="list-decimal pl-5 space-y-2 text-gray-700">
            <li>
              Email{" "}
              <a
                className="text-accent hover:underline"
                href={`mailto:${companyLegal.contactEmail}?subject=${encodeURIComponent("Data Deletion Request")}`}
              >
                {companyLegal.contactEmail}
              </a>{" "}
              with the subject line <strong>Data Deletion Request</strong>.
            </li>
            <li>
              Include your full name, phone number, email address, and (if
              applicable) the Facebook or Instagram name you used on a lead
              form.
            </li>
            <li>
              You may also call{" "}
              <a
                className="text-accent hover:underline"
                href={`tel:${companyLegal.businessPhone}`}
              >
                {companyLegal.businessPhoneDisplay}
              </a>
              .
            </li>
          </ol>
          <p className="text-gray-700">
            We will confirm your request and delete eligible personal data
            within 30 days. You will receive an email when the deletion is
            complete.
          </p>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="font-serif text-xl text-brand">What we delete</h2>
          <p className="text-gray-700">
            On a verified request we delete marketing and CRM records tied to
            you, including:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700">
            <li>Website contact-form submissions</li>
            <li>Facebook / Instagram Lead Ads (Instant Form) leads</li>
            <li>SMS conversation history and CRM contact records</li>
            <li>Related notes and tags created from those sources</li>
          </ul>
        </section>

        <section className="space-y-4 mb-10">
          <h2 className="font-serif text-xl text-brand">What we may keep</h2>
          <p className="text-gray-700">
            Clinical and medical records, billing records, and other information
            we are required to retain under California law or medical-record
            retention rules are not deleted through this process. We will tell
            you if part of your request cannot be completed for that reason.
          </p>
        </section>

        <p className="text-sm text-gray-500">
          See also our{" "}
          <a className="text-accent hover:underline" href={legalRoutes.privacy}>
            Privacy Policy
          </a>
          . Last updated {companyLegal.lastUpdated}.
        </p>
      </div>
    </main>
  );
}
