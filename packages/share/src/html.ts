/**
 * Turn the dashboard's index.html into a read-only page. The app derives its
 * router basename from `<base href>`. A static snapshot reads `data/…` below
 * the base; on the share server, `share` says where the API is.
 */
export type ShareContext = {
  /** All repositories: `/api/v1/repos`. */
  repos: string;
  /** This repository's commits, for the version picker. */
  commits?: string;
  /** This commit's snapshot data (replaces `<base>/data/`). */
  data?: string;
  repo?: string;
  /** A ref or SHA with no shared results. */
  missing?: string;
};

export function dashboardIndex(
  html: string,
  options: { base: string; assets?: string; share?: ShareContext },
): string {
  const attrs = [
    'data-evalkit-snapshot="static"',
    ...(options.share
      ? [`data-evalkit-share="${escapeAttr(JSON.stringify(options.share))}"`]
      : []),
  ].join(' ');
  const result = html
    .replace('<html lang="en">', `<html lang="en" ${attrs}>`)
    .replace(
      '<head>',
      `<head>\n    <base href="${escapeAttr(options.base)}" />`,
    )
    .replaceAll('"/assets/', `"${options.assets ?? './assets/'}`);
  if (
    !result.includes('data-evalkit-snapshot="static"') ||
    !result.includes('<base href=')
  )
    throw new Error('Bundled dashboard index.html has an unexpected shape');
  return result;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}
