// The canonical row shape behind `IssueListItemDto` — one select, every list
// surface (ADR-0018/0026).
//
// This exists because of a real defect. Board, Backlog and the Issues list each
// grew their own near-identical `cardSelect`. When classification chips were
// added they landed on two of the three, so the Issues list silently rendered
// issues with no labels, components or epic badge — and the Backlog's copy
// omitted the `deletedAt: null` guard the Board's had, so a soft-deleted label
// would still have shown as a chip there. Both are the same bug: N copies of
// one shape, updated N-1 times.
//
// Adding a field to a card is now one edit here plus one in `toIssueCardDto`,
// and every list surface gets it at once.
//
// Deliberately NOT used by Home: its widgets render a bare title + assignee, so
// paying for two extra joins per row there would buy nothing. If Home ever
// shows chips, it should adopt this rather than grow a fourth copy.
export const issueCardSelect = {
  id: true,
  projectId: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  updatedAt: true,
  version: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  // Parent epic: the card badge, and the backlog's group-by-epic key (ADR-0026).
  epicId: true,
  epic: { select: { id: true, key: true } },
  // Classification chips (ADR-0018). The `deletedAt` guards are load-bearing —
  // a soft-deleted label must stop appearing on cards, not linger because the
  // join row survived.
  labels: {
    where: { label: { deletedAt: null } },
    select: { label: { select: { id: true, name: true, color: true } } },
  },
  components: {
    where: { component: { deletedAt: null } },
    select: { component: { select: { id: true, name: true } } },
  },
} as const;
