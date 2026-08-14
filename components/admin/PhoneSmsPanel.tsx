"use client";

import TwilioSettingsPanel from "@/components/admin/TwilioSettingsPanel";
import SmsBotPanel from "@/components/crm/SmsBotPanel";
import MetaLeadsPanel from "@/components/admin/MetaLeadsPanel";

/** Phone settings, Meta leads, and SMS chatbot on one admin screen. */
export default function PhoneSmsPanel() {
  return (
    <div className="divide-y divide-gray-200">
      <TwilioSettingsPanel />
      <MetaLeadsPanel />
      <SmsBotPanel />
    </div>
  );
}
