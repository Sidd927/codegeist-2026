// All user-facing strings (copy deck). Checked by scripts/copy-lint.mjs: never "compliant", // copy-lint-allow (documents the banned words)
// "legal advice", "guarantee" or "approved by AI" (UX_DESIGN_SPEC §7). // copy-lint-allow (documents the banned words)

export const copy = {
  product: 'Article25',
  productTagline: 'Privacy review desk',

  nav: { home: 'Overview', inbox: 'Inbox', settings: 'Settings', mainLabel: 'Article25' },

  common: {
    retry: 'Try again',
    loading: 'Loading',
    openInJira: 'Open in Jira',
    openInDesk: 'Open in review desk',
    environmentBadge: (label) => `${label} environment`,
    errorTitle: "Couldn't load this view",
  },

  states: {
    OUT_OF_SCOPE: 'Not in scope',
    NOT_SCREENED: 'Not checked yet',
    SCREENING: 'Checking…',
    SCREENING_FAILED: 'Check failed',
    CLEAR: 'No review needed',
    INVENTORY_UPDATE: 'Known processing',
    NEEDS_INFO: 'Needs information',
    REVIEW_REQUIRED: 'Review required',
    DPIA_LIKELY: 'DPIA likely',
    APPROVED: 'Approved',
    APPROVED_WITH_CONDITIONS: 'Approved with conditions',
    CHANGES_REQUESTED: 'Changes requested',
    REJECTED: 'Rejected',
    STALE: 'Changed since approval',
  },

  panel: {
    title: 'Privacy',
    notScreenedWhy: 'Article25 has not checked this work item for planned personal-data processing.',
    checksOff: 'Automatic privacy checks are not switched on for this site yet.',
    denied: "You don't have permission to view privacy details for this work item.",
    errorBody: "Couldn't load privacy status for this work item.",
  },

  home: {
    title: 'Privacy review desk',
    lead: 'Article25 reads new and changed work items for planned personal-data processing, routes the ones that need a decision to your privacy reviewers, and keeps a record of every decision.',
    loopLabel: 'How a review moves through Article25',
    loop: [
      { key: 'detect', title: 'Detect', body: 'New and changed work items are checked automatically. Nobody needs to tag anything.' },
      { key: 'review', title: 'Review', body: 'Findings quote the exact words that matter and show what is new compared with what is already approved.' },
      { key: 'decide', title: 'Decide', body: 'A named reviewer approves, sets conditions, asks for changes or rejects.' },
      { key: 'enforce', title: 'Enforce', body: 'Jira can block development until the decision is made. A material change after approval re-opens the review.' },
      { key: 'record', title: 'Record', body: 'Every decision is kept in a tamper-evident record that your organisation owns.' },
    ],
    exampleTitle: 'What a review looks like',
    exampleNotice: 'Example only: a fictional work item, not a real review.',
    exampleBadge: 'Example',
    whatsNewLabel: "What's new",
    setupTitle: 'Setup on this site',
    access: { title: 'Your access', admin: 'Jira administrator: you can open Settings.', notAdmin: 'You can browse the desk. Settings are available to Jira administrators.' },
    setup: {
      checks: { label: 'Automatic privacy checks', off: 'Off', on: 'On' },
      reviewers: { label: 'Reviewer group', value: 'Not set' },
      gate: { label: 'Workflow gate', value: 'Not added to any workflow' },
      register: { label: 'Decision register', value: 'Not connected' },
    },
  },

  inbox: {
    title: 'Inbox',
    views: { pending: 'Pending', stale: 'Changed since approval', 'needs-info': 'Needs information', 'all-open': 'All open' },
    viewsLabel: 'Inbox views',
    emptyChecksOffTitle: 'Nothing to review yet',
    emptyChecksOffBody: 'Automatic privacy checks are not switched on for this site. When they are, work items that need a privacy decision will appear here, with the most serious first.',
    emptyTitle: 'Nothing waiting for review',
    emptyBody: 'New and changed work items in scope are checked automatically.',
    openReview: 'Open a work item',
    openReviewHint: 'Enter a work item key to open it in the review workspace.',
    openReviewField: 'Work item key',
    openReviewSubmit: 'Open',
    invalidKey: 'Enter a key like SHOP-42.',
  },

  review: {
    back: 'Inbox',
    documentLabel: 'Work item text',
    summaryHeading: 'Summary',
    descriptionHeading: 'Description',
    noDescription: 'This work item has no description.',
    truncated: 'This description is long; only the first part is shown.',
    marginLabel: 'Findings',
    marginNotScreenedTitle: 'Not checked yet',
    marginNotScreenedBody: 'When this work item is checked, each finding appears here as a numbered note linked to the exact words in the text.',
    decisionLabel: 'Decision',
    decisionOptions: {
      APPROVED: 'Approve',
      APPROVED_WITH_CONDITIONS: 'Approve with conditions',
      CHANGES_REQUESTED: 'Request changes',
      REJECTED: 'Reject',
    },
    decisionUnavailable: {
      CHECKS_NOT_ENABLED: 'Decisions become available after a privacy check. Automatic checks are not switched on for this site yet.',
      NOT_SCREENED: 'Decisions become available after this work item has been checked.',
    },
    recordDecision: 'Record decision',
    tabsLabel: 'Workspace view',
    tabText: 'Text',
    tabFindings: (n) => `Findings (${n})`,
    notFoundTitle: 'Work item not found',
    notFoundBody: "It doesn't exist, or you don't have permission to view it.",
  },

  settings: {
    title: 'Settings',
    deniedTitle: 'Settings are available to Jira administrators',
    deniedBody: 'Ask a Jira administrator if something needs to change.',
    sectionsLabel: 'Settings sections',
    sections: {
      scope: { title: 'Scope and policy', body: 'Which projects are checked and which outcomes need a human decision.' },
      people: { title: 'People', body: 'Reviewer group, recovery group and separation of duties.' },
      inventory: { title: 'What is already approved', body: 'Approved vendors and the data categories each project already processes.' },
      ai: { title: 'AI', body: 'Whether AI-assisted checks are used, which model, and a daily budget.' },
      register: { title: 'Decision register', body: 'Where the customer-owned record of decisions is published in Confluence.' },
      gate: { title: 'Workflow gate', body: 'Where the Article25 gate is active, and monitor mode.' },
    },
    status: { 'not-configured': 'Not configured', off: 'Off', 'not-connected': 'Not connected', 'not-added': 'Not added' },
    availableLater: 'Configuration for this section is not available in this version.',
    environment: 'Environment',
    production: 'Production',
    version: 'Version',
  },

  notFound: { title: 'Page not found', body: 'This page does not exist in Article25.', home: 'Go to overview' },
};
