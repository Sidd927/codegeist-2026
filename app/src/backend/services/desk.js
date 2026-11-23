// Application services for the Stage 3 foundation. Pure orchestration over injected adapters so they
// can be unit-tested without Forge. Nothing here returns account IDs, emails or other identifiers of
// people, and nothing here makes or simulates a privacy decision.
import { AppError, ErrorCode } from '../lib/errors.js';
import { FEATURES, APP_VERSION } from '../lib/config.js';
import { adfToBlocks } from '../../core/text.js';
import * as validate from '../lib/validate.js';

/** Review state for items Article25 has not checked. Only the screening pipeline (M2) may change it. */
const NOT_SCREENED = Object.freeze({ state: 'NOT_SCREENED', findings: [] });

export function createDeskServices({ jira, config, log }) {
  async function safeIsAdmin() {
    try {
      return await jira.isJiraAdmin();
    } catch (e) {
      // Fail closed: an unknown admin status is treated as "not an admin".
      log.warn({ evt: 'admin-check.failed', code: e?.code ?? 'INTERNAL', status: e?.status });
      return false;
    }
  }

  return {
    async appContext() {
      return {
        product: 'Article25',
        version: APP_VERSION,
        environment: { name: config.name, label: config.label },
        features: FEATURES,
        roles: { jiraAdmin: await safeIsAdmin() },
      };
    },

    /** Issue panel: the issue comes from the Forge context (never from client input). */
    async panelState(extensionIssue) {
      const id = validate.issueId(extensionIssue?.id);
      try {
        const issue = await jira.getIssueIdentity(id);
        return { access: 'granted', issue: { id: issue.id, key: issue.key, projectKey: issue.projectKey }, review: NOT_SCREENED, features: FEATURES };
      } catch (e) {
        if (e?.code === ErrorCode.NOT_FOUND) return { access: 'denied', issue: null, review: null, features: FEATURES };
        throw e;
      }
    },

    /** Review workspace (Margin): the current text of the work item, read as the reviewer. */
    async workspace(rawKey) {
      const key = validate.issueKey(rawKey);
      const doc = await jira.getIssueDocument(key);
      const { blocks, truncated } = adfToBlocks(doc.description);
      return {
        issue: {
          id: doc.id,
          key: doc.key,
          summary: doc.summary,
          status: doc.status,
          statusCategory: doc.statusCategory,
          projectKey: doc.projectKey,
          projectName: doc.projectName,
          issueType: doc.issueType,
        },
        document: { summary: doc.summary, blocks, truncated },
        review: NOT_SCREENED,
        decision: { available: false, reason: FEATURES.screening ? 'NOT_SCREENED' : 'CHECKS_NOT_ENABLED' },
        features: FEATURES,
      };
    },

    /** Reviewer inbox. Nothing can be pending until the screening pipeline exists (M2). */
    async inbox(rawView) {
      const view = validate.inboxView(rawView);
      return { enabled: FEATURES.screening, view, items: [], counts: null };
    },

    /** Settings are restricted to Jira administrators, checked server-side on every call. */
    async settingsOverview() {
      if (!(await safeIsAdmin())) throw new AppError(ErrorCode.NOT_AUTHORISED, 'Settings are available to Jira administrators.');
      return {
        environment: { name: config.name, label: config.label },
        version: APP_VERSION,
        sections: [
          { key: 'scope', status: 'not-configured' },
          { key: 'people', status: 'not-configured' },
          { key: 'inventory', status: 'not-configured' },
          { key: 'ai', status: 'off' },
          { key: 'register', status: 'not-connected' },
          { key: 'gate', status: 'not-added' },
        ],
      };
    },
  };
}
