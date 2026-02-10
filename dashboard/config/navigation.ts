import type { NavItem } from "@/types/navigation";

export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: "fa-house" },
  {
    label: "Characters",
    icon: "fa-user",
    children: [
      { href: "/models/characters", label: "Characters", icon: "fa-users" },
      { href: "/characters/create", label: "Create Character", icon: "fa-user-plus" },
      { href: "/characters/my-ocs", label: "My OCs", icon: "fa-id-card" },
      { href: "/characters/my-companions", label: "My Companions", icon: "fa-handshake" },
      { href: "/characters/inventories", label: "Inventories", icon: "fa-box" },
      { href: "/characters/relationships", label: "Relationships", icon: "fa-heart" },
      { href: "/characters/moderation", label: "Character Moderation", icon: "fa-shield-halved" },
    ],
  },
  {
    label: "Models",
    icon: "fa-database",
    children: [
      { href: "/models/items", label: "Items", icon: "fa-cube" },
      { href: "/models/pets", label: "Pets", icon: "fa-paw" },
      { href: "/models/monsters", label: "Monsters", icon: "fa-dragon" },
      { href: "/models/starter-gear", label: "Starter Gear", icon: "fa-shield" },
      { href: "/models/villages", label: "Villages", icon: "fa-house" },
      { href: "/models/village-shops", label: "Village Shops", icon: "fa-store" },
    ],
  },
  { href: "/levels", label: "Levels & Progression", icon: "fa-chart-line" },
  { href: "/stats", label: "Statistics", icon: "fa-chart-bar" },
  { href: "/calendar", label: "Calendar", icon: "fa-calendar" },
  { href: "/profile", label: "Profile", icon: "fa-user-circle" },
  {
    label: "Admin",
    icon: "fa-shield-halved",
    children: [
      { href: "/characters/moderation", label: "Approvals", icon: "fa-check-circle" },
      { href: "/admin/database", label: "Database Editor", icon: "fa-database" },
      { href: "/admin/quests", label: "Quests", icon: "fa-scroll" },
    ],
  },
];
