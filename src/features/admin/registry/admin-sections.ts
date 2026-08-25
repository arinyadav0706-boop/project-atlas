import {
  Building2,
  GitBranch,
  Flag,
  ScrollText,
  SlidersHorizontal,
  Users,
  Network,
  type LucideIcon,
} from "lucide-react";
import { AdminCapability } from "@/features/admin/authz/capabilities";

// The admin console's tabs are registry entries, not hardcoded markup
// (ADR-0022 §3). A new admin area (Users, Roles, Policy, Billing) is one entry
// here + its page — the console renders whatever the actor's capabilities allow,
// so nothing else changes. This is the "compatible with future modules without
// breaking changes" guarantee, concretely.
export interface AdminSection {
  id: string;
  label: string;
  href: string;
  capability: AdminCapability;
  icon: LucideIcon;
  order: number;
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    id: "organization",
    label: "Organization",
    href: "/admin/organization",
    capability: AdminCapability.MANAGE_ORGANIZATION,
    icon: Building2,
    order: 10,
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    capability: AdminCapability.MANAGE_USERS,
    icon: Users,
    order: 15,
  },
  {
    id: "teams",
    label: "Teams",
    href: "/admin/teams",
    capability: AdminCapability.MANAGE_TEAMS,
    icon: Network,
    order: 18,
  },
  {
    id: "custom-fields",
    label: "Custom Fields",
    href: "/admin/custom-fields",
    capability: AdminCapability.MANAGE_CUSTOM_FIELDS,
    icon: SlidersHorizontal,
    order: 19,
  },
  {
    id: "code",
    label: "Code",
    href: "/admin/code",
    capability: AdminCapability.MANAGE_CODE_CONNECTIONS,
    icon: GitBranch,
    order: 20,
  },
  {
    id: "feature-flags",
    label: "Feature Flags",
    href: "/admin/feature-flags",
    capability: AdminCapability.MANAGE_FEATURE_FLAGS,
    icon: Flag,
    order: 20,
  },
  {
    id: "audit-log",
    label: "Audit Log",
    href: "/admin/audit-log",
    capability: AdminCapability.VIEW_AUDIT_LOG,
    icon: ScrollText,
    order: 30,
  },
];
