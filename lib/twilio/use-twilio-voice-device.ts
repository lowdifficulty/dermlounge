"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Call, Device } from "@twilio/voice-sdk";

export type VoiceCallPhase = "idle" | "connecting" | "ringing" | "open" | "closed";

function formatTwilioVoiceError(error: { code?: number; message?: string }): string {
  const code = typeof error.code === "number" ? error.code : null;
  const message = error.message?.trim() || "Call failed";
  if (code == null) return message;
  if (code === 31000) {
    return `${message} (${code}). Allow microphone access, or switch to Cell bridge.`;
  }
  return `${message} (${code})`;
}

function toDialParam(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

export function useTwilioVoiceDevice() {
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [browserReady, setBrowserReady] = useState(false);
  const [browserInitializing, setBrowserInitializing] = useState(true);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [callPhase, setCallPhase] = useState<VoiceCallPhase>("idle");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      setBrowserInitializing(true);
      setBrowserError(null);
      try {
        const res = await fetch("/api/staff/twilio/voice-token");
        const data = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || !data.token) {
          throw new Error(data.error || "Browser calling unavailable");
        }

        const device = new Device(data.token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          closeProtection: "A call is in progress. Hang up before closing.",
        });

        device.on("registered", () => {
          if (!cancelled) {
            setBrowserReady(true);
            setBrowserInitializing(false);
          }
        });

        device.on("error", (event) => {
          setBrowserError(formatTwilioVoiceError(event));
        });

        device.on("tokenWillExpire", async () => {
          try {
            const refresh = await fetch("/api/staff/twilio/voice-token");
            const refreshData = (await refresh.json()) as { token?: string };
            if (refresh.ok && refreshData.token) {
              device.updateToken(refreshData.token);
            }
          } catch {
            /* ignore refresh errors */
          }
        });

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;
      } catch (err) {
        if (!cancelled) {
          setBrowserError(
            err instanceof Error ? err.message : "Browser calling unavailable"
          );
          setBrowserInitializing(false);
          setBrowserReady(false);
        }
      }
    }

    void setup();

    return () => {
      cancelled = true;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      callRef.current = null;
    };
  }, []);

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
    setMuted(false);
    setCallPhase("idle");
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  const connectBrowser = useCallback(
    async (toPhone: string, options?: { contactId?: string }) => {
      const device = deviceRef.current;
      if (!device || !browserReady) {
        return { ok: false as const, error: "Browser phone not ready" };
      }

      const e164 = toDialParam(toPhone);
      setCallPhase("connecting");
      setBrowserError(null);

      try {
        const outgoing = await device.connect({ params: { To: e164 } });
        callRef.current = outgoing;

        outgoing.on("ringing", () => setCallPhase("ringing"));
        outgoing.on("accept", () => {
          setCallPhase("open");
          const sid = outgoing.parameters?.CallSid;
          if (sid) {
            void fetch("/api/staff/twilio/log-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: e164,
                callSid: sid,
                contactId: options?.contactId,
              }),
            });
          }
        });
        outgoing.on("disconnect", () => {
          callRef.current = null;
          setMuted(false);
          setCallPhase("idle");
        });
        outgoing.on("cancel", () => {
          callRef.current = null;
          setMuted(false);
          setCallPhase("idle");
        });
        outgoing.on("error", (event) => {
          setBrowserError(formatTwilioVoiceError(event));
          setCallPhase("idle");
        });

        return { ok: true as const };
      } catch (err) {
        setCallPhase("idle");
        const msg = err instanceof Error ? err.message : "Call failed";
        setBrowserError(msg);
        return { ok: false as const, error: msg };
      }
    },
    [browserReady]
  );

  const inCall =
    callPhase === "connecting" || callPhase === "ringing" || callPhase === "open";

  return {
    browserReady,
    browserInitializing,
    browserError,
    callPhase,
    inCall,
    muted,
    connectBrowser,
    hangUp,
    toggleMute,
  };
}
