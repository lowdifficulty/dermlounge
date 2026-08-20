import type { Metadata } from "next";
import WoundCareLanding from "@/components/wound-care/WoundCareLanding";

export const metadata: Metadata = {
  title: "Wound Care Consultation | DermLounge",
  description:
    "Book a free wound care consultation with DermLounge advanced wound care specialists.",
  robots: { index: true, follow: true },
};

export default function WoundCarePage() {
  return <WoundCareLanding />;
}
