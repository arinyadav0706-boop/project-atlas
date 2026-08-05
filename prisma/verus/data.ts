// Static content pools + blueprint for the VERUS demo company (ADR-0033).
// Kept separate from the generator so the shape of the company is easy to read
// and tweak. Nothing here touches the database.

export const ORG_ID = "verus-demo-org";
export const ORG_NAME = "VERUS";
// .example is a reserved TLD (RFC 2606) — these addresses can never be real
// mailboxes, so the demo can never accidentally email a stranger.
export const ORG_DOMAIN = "verus.example";

// The demo owner's two admin accounts (see ADR-0033 login model).
export const GOOGLE_ADMIN = { email: "arinyadav0706@gmail.com", name: "Arin Yadav" };
export const CREDENTIALS_ADMIN = {
  email: "arin.yadav2021a@vitalumn.ac.in",
  name: "Arin Yadav (Alumni)",
};

export const TOTAL_USERS = 150;
// Extra org ADMINs beyond the two owner accounts (IT / platform admins).
export const EXTRA_ADMINS = 4;

// "Now" for the whole dataset. Fixed so due-dates / overdue / sprint windows are
// stable across runs.
export const NOW = new Date("2026-08-05T12:00:00.000Z");

// ---- Org chart (people axis). parentKey builds the hierarchy; the deepest
// branch (Engineering → Platform → Core → Payments → Backend Pod) is 5 levels,
// exercising the recursive manager-visibility traversal (ADR-0032). ----
export interface TeamSpec {
  key: string;
  name: string;
  parentKey: string | null;
  weight: number; // relative headcount
}

export const TEAMS: readonly TeamSpec[] = [
  { key: "eng", name: "Engineering", parentKey: null, weight: 1 },
  { key: "eng-platform", name: "Platform Engineering", parentKey: "eng", weight: 1 },
  { key: "eng-core", name: "Core Services", parentKey: "eng-platform", weight: 1 },
  { key: "eng-payments", name: "Payments Squad", parentKey: "eng-core", weight: 8 },
  { key: "eng-payments-be", name: "Payments Backend Pod", parentKey: "eng-payments", weight: 6 },
  { key: "eng-identity", name: "Identity Squad", parentKey: "eng-core", weight: 8 },
  { key: "eng-infra", name: "Infrastructure", parentKey: "eng-platform", weight: 9 },
  { key: "eng-product", name: "Product Engineering", parentKey: "eng", weight: 1 },
  { key: "eng-web", name: "Web Squad", parentKey: "eng-product", weight: 12 },
  { key: "eng-mobile", name: "Mobile Squad", parentKey: "eng-product", weight: 10 },
  { key: "eng-growth", name: "Growth Squad", parentKey: "eng-product", weight: 8 },
  { key: "eng-qa", name: "Quality Engineering", parentKey: "eng", weight: 10 },
  { key: "pd", name: "Product & Design", parentKey: null, weight: 1 },
  { key: "pd-pm", name: "Product Management", parentKey: "pd", weight: 9 },
  { key: "pd-design", name: "Design", parentKey: "pd", weight: 9 },
  { key: "data", name: "Data & Analytics", parentKey: null, weight: 1 },
  { key: "data-platform", name: "Data Platform", parentKey: "data", weight: 9 },
  { key: "data-ds", name: "Data Science", parentKey: "data-platform", weight: 8 },
  { key: "ops", name: "Operations", parentKey: null, weight: 1 },
  { key: "ops-it", name: "IT & Security", parentKey: "ops", weight: 8 },
  { key: "ops-support", name: "People & Support", parentKey: "ops", weight: 9 },
];

// ---- Projects (work axis). Deliberately different shapes. ----
export interface ProjectSpec {
  key: string;
  name: string;
  description: string;
  shape: "scrum" | "kanban";
  issueCount: number;
  components: readonly string[];
  // Named explicitly, one per epic: a real project of this size runs 10–25
  // epics, and repeated epic titles are the fastest way to make a demo look
  // generated. The list length IS the epic count.
  epics: readonly string[];
  completedSprints: number;
  activeSprints: number;
  plannedSprints: number;
}

export const PROJECTS: readonly ProjectSpec[] = [
  {
    key: "VWP",
    name: "VERUS Web Platform",
    description: "The flagship web application — billing, dashboards, reporting and the public API.",
    shape: "scrum",
    issueCount: 3600,
    components: [
      "Authentication",
      "Billing",
      "Dashboard",
      "Public API",
      "Notifications",
      "Search",
      "Reporting",
      "Onboarding",
    ],
    epics: [
      "Billing & Subscriptions", "Usage-Based Pricing", "Reporting & Analytics",
      "Dashboard Widgets", "Notifications Platform", "Email Deliverability",
      "Search & Discovery", "Onboarding Revamp", "Self-Serve Trials",
      "Public API v2", "Webhooks & Integrations", "Admin Console",
      "SSO & Identity", "Audit & Compliance", "Rate Limiting & Quotas",
      "Performance Hardening", "Accessibility (WCAG 2.2)", "Internationalization",
      "Data Export & Import", "Design System Uplift", "Mobile-Responsive Web",
      "Customer Health Scoring",
    ],
    completedSprints: 4,
    activeSprints: 1,
    plannedSprints: 2,
  },
  {
    key: "VMOB",
    name: "VERUS Mobile",
    description: "Native iOS and Android apps with offline sync and push.",
    shape: "scrum",
    issueCount: 1300,
    components: ["iOS", "Android", "Push", "Offline Sync", "App Shell"],
    epics: [
      "Offline Sync", "Push Notifications", "Biometric Login", "App Shell Rewrite",
      "iOS 26 Readiness", "Android Material 3", "In-App Purchases", "Deep Linking",
      "Crash-Free Rate", "Tablet Layouts", "Camera & Attachments",
      "Home-Screen Widgets", "Accessibility on Mobile", "Release Automation",
    ],
    completedSprints: 3,
    activeSprints: 1,
    plannedSprints: 1,
  },
  {
    key: "VDP",
    name: "VERUS Data Platform",
    description: "Ingestion, warehouse, pipelines and ML powering analytics.",
    shape: "scrum",
    issueCount: 1300,
    components: ["Ingestion", "Warehouse", "Pipelines", "ML", "Dashboards"],
    epics: [
      "Ingestion Pipeline v2", "Warehouse Migration", "Streaming Events",
      "Data Quality Monitors", "Semantic Layer", "Self-Serve Dashboards",
      "ML Recommendations", "Feature Store", "Anomaly Detection",
      "Lineage & Catalog", "PII Redaction", "Backfill Tooling",
      "Realtime Metrics", "Warehouse Cost Optimisation",
    ],
    completedSprints: 3,
    activeSprints: 1,
    plannedSprints: 1,
  },
  {
    key: "OPS",
    name: "VERUS Operations",
    description: "Internal IT, security, facilities and people-ops request queue (kanban).",
    shape: "kanban",
    issueCount: 1100,
    components: ["IT Support", "Facilities", "Security", "People Ops"],
    epics: [
      "Laptop Refresh Programme", "Access Reviews", "Device Encryption Rollout",
      "Security Awareness Training", "Incident Response Drills",
      "Helpdesk SLA Improvements", "New-Hire Onboarding Kit",
      "Office Move — Floor 3", "Vendor Onboarding", "Payroll System Upgrade",
    ],
    completedSprints: 0,
    activeSprints: 0,
    plannedSprints: 0,
  },
];

// ---- Name pools (mixed origins for realism). ----
export const FIRST_NAMES: readonly string[] = [
  "Aarav", "Vivaan", "Aditya", "Arjun", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir", "Ananya",
  "Diya", "Aadhya", "Saanvi", "Aarohi", "Anika", "Navya", "Myra", "Kiara", "Sara", "Riya",
  "Meera", "Kavya", "Priya", "Neha", "Pooja", "Sneha", "Rahul", "Amit", "Vikram", "Karan",
  "Nikhil", "Siddharth", "Varun", "Manish", "Sameer", "Rajesh", "Emma", "Liam", "Noah", "Olivia",
  "Ava", "Sophia", "James", "Lucas", "Mia", "Ethan", "Isabella", "Mason", "Amelia", "Harper",
  "Daniel", "Michael", "Grace", "Chloe", "Leo", "Zoe", "Omar", "Fatima", "Yusuf", "Aisha",
  "Hana", "Wei", "Mei", "Chen", "Hiro", "Yuki", "Sofia", "Diego", "Lucia", "Mateo",
];

export const LAST_NAMES: readonly string[] = [
  "Sharma", "Verma", "Iyer", "Reddy", "Nair", "Joshi", "Gupta", "Mehta", "Rao", "Menon",
  "Kapoor", "Malhotra", "Chopra", "Bose", "Das", "Banerjee", "Pillai", "Desai", "Shah", "Patel",
  "Kulkarni", "Deshpande", "Krishnan", "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Chen", "Wang", "Kim", "Park", "Tanaka", "Sato", "Khan",
  "Ahmed", "Ali", "Hassan", "Silva", "Costa", "Rossi",
];

// ---- Issue text banks. Sized so the cross-product comfortably exceeds the
// issue count: repeated titles are what make generated data look generated. ----
export const VERBS: readonly string[] = [
  "create", "update", "delete", "export", "import", "filter", "sort", "search",
  "configure", "validate", "sync", "archive", "restore", "assign", "schedule",
  "refresh", "paginate", "bulk-edit", "duplicate", "share", "approve", "reassign",
  "snooze", "pin", "merge", "preview", "reorder", "subscribe to",
];

export const NOUNS: readonly string[] = [
  "user profile", "billing invoice", "dashboard widget", "API endpoint", "notification",
  "report", "audit log", "project settings", "team", "permission set", "webhook",
  "integration", "session", "avatar", "comment thread", "attachment", "sprint",
  "backlog item", "saved filter", "keyboard shortcut", "export job", "data pipeline",
  "payment method", "subscription plan", "usage record", "invite", "API key",
  "workspace", "board column", "swimlane", "release note", "changelog entry",
  "email template", "SLA policy", "escalation rule", "custom field", "issue type",
  "workflow status", "dashboard filter", "scheduled report", "seat assignment",
  "tax rate", "credit note", "retention policy",
];

export const ROLES: readonly string[] = [
  "user", "admin", "manager", "viewer", "developer", "project lead", "finance analyst",
  "support agent", "team member", "auditor",
];

// Appended to roughly half of all titles — the cheapest way to multiply variety
// while keeping every title plausible.
export const CONTEXTS: readonly string[] = [
  "on mobile", "in the admin console", "from the board", "for enterprise accounts",
  "in bulk", "on the billing page", "via the public API", "for archived projects",
  "under load", "in the backlog view", "for large workspaces", "during onboarding",
  "in the sprint report", "from the command palette", "for read-only members",
];

export const BUG_PROBLEMS: readonly string[] = [
  "returns 500 on empty input", "flickers on reload", "loses state after navigation",
  "shows stale data", "throws on null value", "is misaligned on mobile",
  "times out under load", "double-submits on slow networks", "ignores the active filter",
  "breaks keyset pagination", "leaks memory on unmount", "renders the wrong timezone",
  "drops the sort order", "shows a blank state incorrectly", "escapes HTML twice",
  "loses focus on tab", "rounds currency incorrectly", "fires duplicate webhooks",
  "keeps a stale cache entry", "silently swallows the error", "truncates long names",
  "misreports the total count",
];

export const TASK_TEMPLATES: readonly string[] = [
  "Refactor the {noun} module", "Add tests for the {noun}", "Improve {noun} performance",
  "Document the {noun} flow", "Instrument the {noun} with metrics",
  "Migrate the {noun} to the new API", "Add an index for {noun} lookups",
  "Remove the legacy {noun} path", "Harden {noun} validation",
  "Cache the {noun} response", "Add an audit entry for {noun} changes",
  "Backfill missing {noun} records", "Rate-limit the {noun} endpoint",
  "Add a feature flag for the {noun}",
];

export const DESCRIPTIONS: readonly string[] = [
  "Follows the acceptance criteria in the module doc. Coordinate with the component lead before merging.",
  "Split out of the parent epic. Keep the change behind the feature flag until QA signs off.",
  "Reported by a customer via support. Needs a repro and a regression test.",
  "Part of the quarterly hardening pass. No user-facing change expected.",
  "Blocked until the API contract lands. Track the dependency in the linked issue.",
  "",
];

export const COMMENTS: readonly string[] = [
  "Picking this up.", "Blocked on the API change — flagged to the lead.", "PR is up for review.",
  "Can we get a design review before this ships?", "Reproduced on staging, adding a test.",
  "Fixed in the latest build, please re-check.", "Deferring to next sprint, capacity is tight.",
  "Needs product sign-off.", "LGTM 🚀", "Added unit + integration coverage.", "Merged to main.",
  "Reopening — still repro on mobile.", "Assigning to you, mind taking a look?",
  "What's the current status here?", "Bumping priority, this is blocking the release.",
];
