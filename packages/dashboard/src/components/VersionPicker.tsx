import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { versionHref, type ShareCommit } from '../share.js';

function label(commit: ShareCommit): string {
  const date = (commit.committedAt ?? commit.firstSeenAt).slice(0, 10);
  const results = commit.runs
    ? `${commit.passed}/${commit.runs} passed`
    : 'no committed runs';
  return [commit.commit.slice(0, 7), commit.ref, date, results]
    .filter(Boolean)
    .join(' · ');
}

/** Switch between shared commits of this repository. */
export function VersionPicker({
  repo,
  current,
  commitsUrl,
}: {
  repo: string;
  current: string;
  commitsUrl: string;
}) {
  const location = useLocation();
  const [commits, setCommits] = useState<ShareCommit[]>();
  useEffect(() => {
    let active = true;
    void fetch(commitsUrl)
      .then(
        (response) => response.json() as Promise<{ commits: ShareCommit[] }>,
      )
      .then((value) => {
        if (active) setCommits(value.commits);
      })
      .catch(() => {
        if (active) setCommits([]);
      });
    return () => {
      active = false;
    };
  }, [commitsUrl]);
  const known = commits?.some((commit) => commit.commit === current);
  return (
    <label className="version-picker ml-auto flex min-w-0 items-center gap-2 text-[13px] text-kumo-subtle">
      <span className="hidden sm:inline">Version</span>
      <select
        aria-label="Version"
        className="max-w-[22rem] min-w-0 truncate rounded-md border border-kumo-line bg-kumo-base px-2 py-1 font-mono text-xs text-kumo-strong"
        value={current}
        onChange={(event) =>
          window.location.assign(
            versionHref(
              repo,
              event.target.value,
              location.pathname,
              location.search,
            ),
          )
        }
      >
        {!known ? <option value={current}>{current.slice(0, 7)}</option> : null}
        {commits?.map((commit) => (
          <option key={commit.commit} value={commit.commit}>
            {label(commit)}
          </option>
        ))}
      </select>
    </label>
  );
}
