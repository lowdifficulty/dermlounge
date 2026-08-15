"use client";

import Link from "next/link";
import TwilioSettingsPanel from "@/components/admin/TwilioSettingsPanel";
import SmsBotPanel from "@/components/crm/SmsBotPanel";
import MetaLeadsPanel from "@/components/admin/MetaLeadsPanel";

function AdsPerformanceLink() {
  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-brand">Ads performance</h2>
          <p className="mt-1 text-sm text-gray-600">
            Owner-facing Meta dashboard: CPC, CPL, CTR, spend, and the top ad creative.
            Connect Meta on this page. Ads numbers appear on the Meta Ads dashboard.
          </p>
        </div>
        <Link
          href="/admin/meta-ads/"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Open Meta Ads
        </Link>
      </div>
    </div>
  );
}

/** Phone settings, Meta leads, ads performance, and SMS chatbot on one admin screen. */
export default function PhoneSmsPanel() {
  return (
    <div className="divide-y divide-gray-200">
      <TwilioSettingsPanel />
      <AdsPerformanceLink />
      <MetaLeadsPanel />
      <SmsBotPanel />
    </div>
  );
}
