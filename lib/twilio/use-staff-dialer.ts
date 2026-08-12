"use client";

import { useCallback, useState } from "react";
import {
  STAFF_CALLBACK_HELP,
  useStaffCallbackPhone,
} from "@/lib/twilio/use-staff-callback-phone";
import { useTwilioVoiceDevice } from "@/lib/twilio/use-twilio-voice-device";

export type DialMode = "browser" | "bridge";

export type DialOptions = {
  contactId?: string;
  mode?: DialMode;
};

export function useStaffDialer() {
  const [toPhone, setToPhone] = useState("");
  const { staffPhone, setStaffPhone, configuredInSettings } = useStaffCallbackPhone();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<DialMode>("browser");

  const voice = useTwilioVoiceDevice();

  const dialBridge = useCallback(
    async (to: string, staff: string) => {
      if (staff) setStaffPhone(staff);
      const res = await fetch("/api/staff/twilio/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          staffPhone: staff || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Call failed");
      setMessage("Calling your phone first — answer to connect to the customer.");
      return true;
    },
    [setStaffPhone]
  );

  const dial = useCallback(
    async (overrideTo?: string, options?: DialOptions) => {
      const to = (overrideTo ?? toPhone).trim();
      const staff = staffPhone.trim();
      const mode = options?.mode ?? callMode;

      if (!to) {
        setError("Enter the number to call");
        return false;
      }

      if (voice.inCall) {
        setError("Hang up the current call first");
        return false;
      }

      setBusy(true);
      setMessage(null);
      setError(null);

      try {
        if (mode === "browser" && voice.browserInitializing) {
          setError("Browser phone is still connecting — try again in a moment.");
          return false;
        }

        const useBrowser = mode === "browser" && voice.browserReady;
        if (useBrowser) {
          const result = await voice.connectBrowser(to, {
            contactId: options?.contactId,
          });
          if (result.ok) {
            setMessage("Calling from browser — allow microphone access if prompted.");
            if (!overrideTo) setToPhone("");
            return true;
          }
          if (!staff && !configuredInSettings) {
            throw new Error(result.error || "Browser call failed");
          }
          setMessage("Browser call failed — trying cell bridge.");
        }

        if (!staff && !configuredInSettings) {
          setError(STAFF_CALLBACK_HELP);
          return false;
        }

        await dialBridge(to, staff);
        if (!overrideTo) setToPhone("");
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Call failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [
      callMode,
      configuredInSettings,
      dialBridge,
      staffPhone,
      toPhone,
      voice.browserInitializing,
      voice.browserReady,
      voice.connectBrowser,
      voice.inCall,
    ]
  );

  return {
    toPhone,
    setToPhone,
    staffPhone,
    setStaffPhone,
    configuredInSettings,
    busy,
    message,
    error,
    setMessage,
    setError,
    dial,
    callMode,
    setCallMode,
    staffCallbackHelp: STAFF_CALLBACK_HELP,
    browserReady: voice.browserReady,
    browserInitializing: voice.browserInitializing,
    browserError: voice.browserError,
    inCall: voice.inCall,
    callPhase: voice.callPhase,
    muted: voice.muted,
    hangUp: voice.hangUp,
    toggleMute: voice.toggleMute,
  };
}
