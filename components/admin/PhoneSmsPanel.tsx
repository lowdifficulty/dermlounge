"use client";

import TwilioSettingsPanel from "@/components/admin/TwilioSettingsPanel";
import SmsBotPanel from "@/components/crm/SmsBotPanel";

/** Phone settings and SMS chatbot on one admin screen. */
export default function PhoneSmsPanel() {
  return (
    <div className="divide-y divide-gray-200">
      <TwilioSettingsPanel />
      <SmsBotPanel />
    </div>
  );
}
