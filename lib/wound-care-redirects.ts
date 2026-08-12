/** Short wound-care nav URLs on WordPress → nested mirror routes. */
export const WOUND_CARE_REDIRECTS: ReadonlyArray<{
  source: string;
  destination: string;
}> = [
  {
    source: "/infected-and-inflammatory-wound-care",
    destination: "/advanced-wound-care-services/infected-and-inflammatory-wound-care/",
  },
  {
    source: "/non-healing-wound-care",
    destination: "/advanced-wound-care-services/non-healing-wound-care/",
  },
  {
    source: "/moisture-related-skin-breakdown",
    destination: "/advanced-wound-care-services/moisture-related-skin-breakdown/",
  },
  {
    source: "/traumatic-wound-care",
    destination: "/advanced-wound-care-services/traumatic-wound-care/",
  },
  {
    source: "/surgical-and-post-procedure-wound-care",
    destination: "/advanced-wound-care-services/surgical-and-post-procedure-wound-care/",
  },
  {
    source: "/circulation-related-ulcer-care",
    destination: "/advanced-wound-care-services/circulation-related-ulcer-care/",
  },
  {
    source: "/pressure-related-wounds",
    destination: "/advanced-wound-care-services/pressure-related-wounds/",
  },
] as const;
