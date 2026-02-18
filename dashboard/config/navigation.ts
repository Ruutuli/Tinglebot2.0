import type { NavItem } from "@/types/navigation";

export const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: "fa-house" },
  {
    label: "Characters",
    icon: "fa-user",
    children: [
      { href: "/characters/my-ocs", label: "My OCs", icon: "fa-id-card" },
      { href: "/characters/create", label: "Create Character", icon: "fa-user-plus" },
      { href: "/models/characters", label: "All Characters", icon: "fa-users" },
      { href: "/characters/my-companions", label: "My Companions", icon: "fa-handshake" },
      { href: "/characters/inventories", label: "Inventories", icon: "fa-box" },
      { href: "/characters/relationships", label: "Relationships", icon: "fa-heart" },
    ],
  },
  {
    label: "World",
    icon: "fa-globe",
    children: [
      { href: "/map", label: "ROTW Map", icon: "fa-map" },
      { href: "/explore", label: "Explore", icon: "fa-compass" },
      { href: "/library/archives", label: "Library Archives", icon: "fa-book" },
      { href: "/calendar", label: "Calendar", icon: "fa-calendar" },
    ],
  },
  {
    label: "Progress",
    icon: "fa-chart-line",
    children: [
      { href: "/levels", label: "Levels & Progression", icon: "fa-chart-line" },
      { href: "/stats", label: "Statistics", icon: "fa-chart-bar" },
    ],
  },
  {
    label: "Community",
    icon: "fa-comments",
    children: [
      { href: "/suggestion-box", label: "Suggestion Box", icon: "fa-lightbulb" },
      { href: "/member-lore", label: "Member Submitted Lore", icon: "fa-scroll" },
    ],
  },
  {
    label: "Reference",
    icon: "fa-book-open",
    children: [
      { href: "/models/items", label: "Items", icon: "fa-cube" },
      { href: "/models/pets", label: "Pets", icon: "fa-paw" },
      { href: "/models/monsters", label: "Monsters", icon: "fa-dragon" },
      { href: "/models/starter-gear", label: "Starter Gear", icon: "fa-shield" },
      { href: "/models/villages", label: "Villages", icon: "fa-house" },
      { href: "/models/village-shops", label: "Village Shops", icon: "fa-store" },
    ],
  },
  { href: "/profile", label: "Profile", icon: "fa-user-circle" },
  {
    label: "Admin",
    icon: "fa-shield-halved",
    children: [
      { href: "/admin/database", label: "Database Editor", icon: "fa-database" },
      { href: "/admin/quests", label: "Quests", icon: "fa-scroll" },
      { href: "/admin/relic-archives", label: "Relic Archive Requests", icon: "fa-book" },
    ],
  },
];
