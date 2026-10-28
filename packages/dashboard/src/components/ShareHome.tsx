import { Table } from '@cloudflare/kumo';
import { useEffect, useState } from 'react';
import type { ShareContext, ShareRepo } from '../share.js';
import { DataTable, tableLinkClass } from './DataTable.js';
import { Empty } from './Empty.js';
import { ErrorBanner } from './ErrorBanner.js';

/** The share server's front page: every repository with shared results. */
export function ShareHome({ share }: { share: ShareContext }) {
  const [repos, setRepos] = useState<ShareRepo[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void fetch(share.repos)
      .then((response) => response.json() as Promise<{ repos: ShareRepo[] }>)
      .then((value) => setRepos(value.repos))
      .catch(() => setError('Unable to load repositories'));
  }, [share.repos]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <h1 className="text-base font-semibold text-kumo-strong">
        EvalKit · Shared evals
      </h1>
      {share.missing || (share.repo && !share.data) ? (
        <ErrorBanner
          message={
            share.missing
              ? `No shared results for ${share.missing} in ${share.repo}.`
              : `No shared results for ${share.repo}.`
          }
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {repos && !repos.length ? (
        <Empty message="Nothing shared yet. Run `evalkit share` in an eval project." />
      ) : null}
      {repos?.length ? (
        <DataTable>
          <Table.Header variant="compact">
            <Table.Row>
              <Table.Head>Repository</Table.Head>
              <Table.Head>Commits</Table.Head>
              <Table.Head>Last upload</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {repos.map((repo) => (
              <Table.Row key={repo.key}>
                <Table.Cell>
                  <a className={tableLinkClass} href={`/${repo.key}`}>
                    {repo.key}
                  </a>
                </Table.Cell>
                <Table.Cell className="tabular-nums">{repo.commits}</Table.Cell>
                <Table.Cell className="tabular-nums">
                  {repo.lastUploadAt.slice(0, 16).replace('T', ' ')}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </DataTable>
      ) : null}
    </div>
  );
}
