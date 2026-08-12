import type { GroomerId } from "./types";
import { GROOMERS } from "./groomers";

export function groomerAccentClasses(groomerId: GroomerId): string {
  if (groomerId === "melanie") return "border-gray-400/80 bg-gray-50";
  if (groomerId === "jessica") return "border-gray-300/80 bg-gray-50/80";
  if (groomerId === "diamond") return "border-gray-200/80 bg-white";
  return "border-gray-200 bg-white";
}

export function groomerAppointmentCardClass(
  groomerId: GroomerId,
  options: { isOwn: boolean; cancelled: boolean; colorByGroomer: boolean }
): string {
  if (options.cancelled) return "border-gray-200 bg-gray-50/70 opacity-75";
  if (!options.colorByGroomer) return "border-gray-200 bg-white";
  return groomerAccentClasses(groomerId);
}

export function groomerAppointmentLegendLabel(groomerId: GroomerId): string {
  return GROOMERS[groomerId].name;
}

export function groomerAppointmentLegendDotClass(groomerId: GroomerId): string {
  if (groomerId === "melanie") return "bg-gray-700";
  if (groomerId === "jessica") return "bg-gray-500";
  if (groomerId === "diamond") return "bg-gray-400";
  return "bg-gray-300";
}

export function groomerConversationAvatarClass(
  groomerId: "melanie" | "jessica" | "diamond" | null | undefined
): string {
  if (groomerId === "melanie") return "bg-gray-800 text-white";
  if (groomerId === "jessica") return "bg-gray-600 text-white";
  if (groomerId === "diamond") return "bg-gray-500 text-white";
  return "bg-accent text-white";
}

export function groomerConversationRowClass(
  groomerId: "melanie" | "jessica" | "diamond" | null | undefined,
  active: boolean
): string {
  if (groomerId === "melanie") {
    return active
      ? "bg-gray-100 border-l-4 border-l-gray-800"
      : "hover:bg-gray-50 border-l-4 border-l-gray-300";
  }
  if (groomerId === "jessica") {
    return active
      ? "bg-gray-50 border-l-4 border-l-gray-600"
      : "hover:bg-gray-50/70 border-l-4 border-l-gray-300";
  }
  return active ? "bg-accent-light border-l-4 border-l-accent" : "hover:bg-gray-50 border-l-4 border-l-transparent";
}
