// Forge platform helpers: theming, context, navigation and content-free performance metrics.
import { view, router } from '@forge/bridge';
import { api, getLastInvokeMs } from './api.js';

/** Opt in to Jira's theme (light/dark) via design tokens. Safe to call more than once. */
export async function enableTheme() {
  try {
    await view.theme.enable();
    return true;
  } catch {
    return false; // ADS token fallbacks keep the UI readable in light mode
  }
}

export async function getContext() {
  try {
    return await view.getContext();
  } catch {
    return null;
  }
}

/**
 * Global-page base path for this app and environment, derived from the module's localId
 * (ari:cloud:ecosystem::extension/<appId>/<environmentId>/static/<moduleKey>).
 */
export function deskBasePath(context) {
  const m = /extension\/([0-9a-f-]{36})\/([0-9a-f-]{36})\//i.exec(context?.localId ?? '');
  return m ? `/jira/apps/${m[1]}/${m[2]}` : null;
}

export async function openDesk(context, path = '/') {
  const base = deskBasePath(context);
  if (!base) return false;
  await router.navigate(`${base}${path}`);
  return true;
}

export async function openIssue(issueKey) {
  await router.open(`/browse/${encodeURIComponent(issueKey)}`);
}

/** Report first-content timing once per load: numbers only, no identifiers or content. */
let reported = false;
export function reportFirstContent(surface) {
  if (reported) return;
  reported = true;
  const nav = performance.getEntriesByType?.('navigation')?.[0];
  const metrics = { firstContentMs: Math.round(performance.now()) };
  if (nav?.domContentLoadedEventEnd) metrics.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
  const invokeMs = getLastInvokeMs();
  if (invokeMs != null) metrics.invokeMs = invokeMs;
  api.reportMetrics(surface, metrics);
}
