"use client";

import { useEffect } from "react";
import { lockPageScroll } from "@/lib/scroll-lock";
import WoundCareIntakeForm from "./WoundCareIntakeForm";

export default function WoundCareIntakeModal() {
  useEffect(() => {
    const unlock = lockPageScroll();
    return unlock;
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/[0.82]" aria-hidden="true" />
      <div
        className="relative z-10 w-full sm:max-w-lg md:max-w-3xl lg:max-w-4xl max-h-[92vh] md:max-h-[88vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Complete wound care intake form"
      >
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] md:max-h-[88vh] md:min-h-[min(720px,88vh)]">
          <WoundCareIntakeForm />
        </div>
      </div>
    </div>
  );
}
