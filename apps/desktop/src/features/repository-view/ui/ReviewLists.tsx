import * as ContextMenu from '@radix-ui/react-context-menu';
import { ChevronDown, ChevronRight, CircleDot, GitPullRequest, Plug, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { HostingKind, Issue, PullRequest } from '../../../shared/ipc';
import { useHostingStatus, useIssues, usePullRequests } from '../api/useHosting';
import styles from './BranchSidebar.module.css';
import menu from './menu.module.css';
import type { HostingActions } from './useHostingActions';

/** GitLab and GitHub name the same things differently. */
const WORDS: Record<HostingKind, { requests: string; prefix: string }> = {
  gitLab: { requests: 'Merge requests', prefix: '!' },
  gitHub: { requests: 'Pull requests', prefix: '#' },
};

function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
          {icon}
          <span className={styles.sectionTitle}>{title}</span>
          {count !== undefined && <span className={styles.count}>{count}</span>}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

/** A row that copies its link from its menu; double-click does `onOpen`. */
function ReviewRow({
  label,
  title,
  url,
  onOpen,
  extraItems,
}: {
  label: string;
  title: string;
  url: string;
  onOpen?: () => void;
  extraItems?: ReactNode;
}) {
  return (
    <li>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button type="button" className={styles.row} title={title} onDoubleClick={onOpen}>
            <span className={styles.name}>{label}</span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className={menu.content}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            {extraItems}
            <ContextMenu.Item
              className={menu.item}
              onSelect={() => {
                void navigator.clipboard.writeText(url);
              }}
            >
              Copy link
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  );
}

/** Merge / pull requests and issues of the repository's project on its server. */
export function ReviewLists({ path, actions }: { path: string; actions: HostingActions }) {
  const status = useHostingStatus(path);
  const kind = status.data?.kind ?? null;
  const requests = usePullRequests(path, kind !== null);
  const issues = useIssues(path, kind !== null);
  if (!status.data) return null;

  if (kind === null) {
    return (
      <Section title="Merge requests" icon={<GitPullRequest size={13} aria-hidden />}>
        <button
          type="button"
          className={styles.showAll}
          onClick={() => {
            actions.openConnect(status.data?.server ?? '');
          }}
        >
          <Plug size={13} aria-hidden />
          Connect {status.data.server}
        </button>
      </Section>
    );
  }

  const words = WORDS[kind];
  const error = requests.error ?? issues.error;
  return (
    <>
      <Section
        title={words.requests}
        icon={<GitPullRequest size={13} aria-hidden />}
        count={requests.data?.length}
        action={
          <button
            type="button"
            className={styles.sectionAction}
            aria-label={`New ${words.requests.toLowerCase().replace(/s$/, '')} from the current branch`}
            title={`New ${words.requests.toLowerCase().replace(/s$/, '')} from the current branch`}
            onClick={actions.openCreate}
          >
            <Plus size={13} aria-hidden />
          </button>
        }
      >
        <ul className={styles.tree} aria-label={words.requests}>
          {(requests.data ?? []).map((request: PullRequest) => (
            <ReviewRow
              key={request.number}
              label={`${words.prefix}${String(request.number)} ${request.draft ? '[Draft] ' : ''}${request.title}`}
              title={`${request.title}\n${request.author}: ${request.sourceBranch} → ${request.targetBranch}\nDouble-click to check out ${request.sourceBranch}`}
              url={request.url}
              onOpen={() => {
                actions.checkoutSource(request);
              }}
              extraItems={
                <ContextMenu.Item
                  className={menu.item}
                  onSelect={() => {
                    actions.checkoutSource(request);
                  }}
                >
                  Check out {request.sourceBranch}
                </ContextMenu.Item>
              }
            />
          ))}
        </ul>
      </Section>
      <Section
        title="Issues"
        icon={<CircleDot size={13} aria-hidden />}
        count={issues.data?.length}
      >
        <ul className={styles.tree} aria-label="Issues">
          {(issues.data ?? []).map((issue: Issue) => (
            <ReviewRow
              key={issue.number}
              label={`#${String(issue.number)} ${issue.title}`}
              title={`${issue.title}\n${issue.author}${issue.labels.length > 0 ? ` · ${issue.labels.join(', ')}` : ''}`}
              url={issue.url}
            />
          ))}
        </ul>
      </Section>
      {error && (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      )}
    </>
  );
}
