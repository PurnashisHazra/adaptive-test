export type LeaderCompany = {
  id: string;
  name: string;
  shortName?: string;
  logo: string;
  /** Branded tile background when the logo asset includes or expects a colored panel. */
  logoSurface?: "dark" | "brand-navy" | "brand-amex";
};

export const PRIMARY_LEADER_COMPANIES: LeaderCompany[] = [
  { id: "apple", name: "Apple", shortName: "Apple", logo: "/logos/apple.svg" },
  { id: "nvidia", name: "NVIDIA", shortName: "NVIDIA", logo: "/logos/nvidia.png" },
  { id: "visa", name: "Visa", shortName: "Visa", logo: "/logos/visa.png", logoSurface: "dark" },
  {
    id: "amex",
    name: "American Express",
    shortName: "AmEx",
    logo: "/logos/amex.png",
    logoSurface: "brand-amex",
  },
  {
    id: "mckinsey",
    name: "McKinsey",
    shortName: "McKinsey",
    logo: "/logos/mckinsey.png",
    logoSurface: "brand-navy",
  },
];

export const STACKED_LEADER_COMPANIES: LeaderCompany[] = [
  { id: "google", name: "Google", logo: "/logos/google.svg" },
  { id: "meta", name: "Meta", logo: "/logos/meta.png" },
  { id: "goldman", name: "Goldman Sachs", logo: "/logos/goldman.svg" },
  { id: "bcg", name: "BCG", logo: "/logos/bcg.svg" },
  { id: "amazon", name: "Amazon", logo: "/logos/amazon.svg" },
];
