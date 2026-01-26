export type NavLink = {
  href: string;
  label: string;
  icon: string;
};

export type NavSection = {
  label: string;
  icon: string;
  children: Array<{
    href: string;
    label: string;
    icon: string;
  }>;
};

export type NavItem = NavLink | NavSection;
