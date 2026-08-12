"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type StaffDialerContextValue = {
  dialerOpen: boolean;
  openDialer: (phone?: string) => void;
  closeDialer: () => void;
  prefillPhone: string;
  clearPrefill: () => void;
};

const StaffDialerContext = createContext<StaffDialerContextValue | null>(null);

export function StaffDialerProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [dialerOpen, setDialerOpen] = useState(false);
  const [prefillPhone, setPrefillPhone] = useState("");

  const openDialer = useCallback(
    (phone?: string) => {
      if (!enabled) return;
      if (phone?.trim()) {
        const digits = phone.replace(/\D/g, "");
        setPrefillPhone(digits.length >= 10 ? digits.slice(-10) : digits);
      }
      setDialerOpen(true);
    },
    [enabled]
  );

  const closeDialer = useCallback(() => {
    setDialerOpen(false);
  }, []);

  const clearPrefill = useCallback(() => {
    setPrefillPhone("");
  }, []);

  const value = useMemo(
    () => ({
      dialerOpen,
      openDialer,
      closeDialer,
      prefillPhone,
      clearPrefill,
    }),
    [clearPrefill, closeDialer, dialerOpen, openDialer, prefillPhone]
  );

  return (
    <StaffDialerContext.Provider value={enabled ? value : null}>
      {children}
    </StaffDialerContext.Provider>
  );
}

export function useStaffDialerPanel() {
  const ctx = useContext(StaffDialerContext);
  return (
    ctx ?? {
      dialerOpen: false,
      openDialer: () => {},
      closeDialer: () => {},
      prefillPhone: "",
      clearPrefill: () => {},
    }
  );
}
