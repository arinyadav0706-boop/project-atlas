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

// ---- Issue text banks. ----
export const EPIC_THEMES: readonly string[] = [
  "Billing & Subscriptions", "Reporting & Analytics", "Notifications Platform",
  "Search & Discovery", "Onboarding Revamp", "Mobile Parity", "Performance Hardening",
  "Admin Console", "Public API v2", "Data Ingestion", "ML Recommendations",
  "Security & Compliance", "Accessibility", "Internationalization", "Self-Serve Trials",
];

export const VERBS: readonly string[] = [
  "create", "update", "delete", "export", "import", "filter", "sort", "search",
  "configure", "validate", "sync", "archive", "restore", "assign", "schedule",
  "refresh", "paginate", "bulk-edit", "duplicate", "share",
];

export const NOUNS: readonly string[] = [
  "user profile", "billing invoice", "dashboard widget", "API endpoint", "notification",
  "report", "audit log", "project settings", "team", "permission set", "webhook",
  "integration", "session", "avatar", "comment thread", "attachment", "sprint",
  "backlog item", "saved filter", "keyboard shortcut", "export job", "data pipeline",
];

export const ROLES: readonly string[] = ["user", "admin", "manager", "viewer", "developer"];

export const BUG_PROBLEMS: readonly string[] = [
  "returns 500 on empty input", "flickers on reload", "loses state after navigation",
  "shows stale data", "throws on null value", "is misaligned on mobile",
  "times out under load", "double-submits on slow networks", "ignores the active filter",
  "breaks keyset pagination", "leaks memory on unmount", "renders the wrong timezone",
];

export const TASK_TEMPLATES: readonly string[] = [
  "Refactor {noun} module", "Add tests for {noun}", "Improve {noun} performance",
  "Document the {noun} flow", "Instrument {noun} with metrics", "Migrate {noun} to the new API",
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
