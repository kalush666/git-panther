import { ArrowLeft, Check, GitBranch, GitMerge, Link } from 'lucide-react';
import { useState } from 'react';

import type { PullRequest } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import { useComparison, usePullRequestReview, useReviewAction } from '../api/useReview';
import type { DiffSource } from '../api/useWorkingTree';
import { formatCommitTime } from '../model/formatTime';
import list from './FileHistoryView.module.css';
import { FileChangeList } from './FileChangeList';
import styles from './ReviewPanel.module.css';
import type { Report } from './useBranchActions';

/** Two revisions to review: a request's branches, or any two refs. */
export interface ReviewTarget {
  base: string;
  head: string;
  /** Set when reviewing a merge / pull request. */
  request: PullRequest | null;
}

/** The revisions a request compares: its branches as last fetched. */
export function requestTarget(request: PullRequest): ReviewTarget {
  return {
    base: `origin/${request.targetBranch}`,
    head: `origin/${request.sourceBranch}`,
    request,
  };
}

type Tab = 'overview' | 'files' | 'commits';

interface ReviewPanelProps {
  path: string;
  target: ReviewTarget;
  /** `!` for GitLab, `#` for GitHub. */
  prefix: string;
  report: Report;
  onOpenDiff: (source: DiffSource) => void;
  onCheckout: (request: PullRequest) => void;
  onClose: () => void;
}

/**
 * Reviews what `head` changes since it forked from `base`: files, commits
 * and, for a request, its description and conversation, with approve and
 * merge on the server.
 */
export function ReviewPanel({
  path,
  target,
  prefix,
  report,
  onOpenDiff,
  onCheckout,
  onClose,
}: ReviewPanelProps) {
  const { request } = target;
  const [tab, setTab] = useState<Tab>(request ? 'overview' : 'files');
  const comparison = useComparison(path, target.base, target.head);
  const tabs: { id: Tab; label: string }[] = [
    ...(request ? [{ id: 'overview' as const, label: 'Overview' }] : []),
    { id: 'files', label: `Files (${String(comparison.data?.changes.length ?? '…')})` },
    { id: 'commits', label: `Commits (${String(comparison.data?.commits.length ?? '…')})` },
  ];
  const title = request
    ? `${prefix}${String(request.number)} ${request.title}`
    : `${target.head} compared with ${target.base}`;

  return (
    <section className={list.view} aria-label={`Review of ${title}`}>
      <header className={list.toolbar}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Graph
        </Button>
        <span className={list.file} title={`${title}\n${target.head} → ${target.base}`}>
          {title}
        </span>
        <div className={list.tabs} role="tablist" aria-label="Review">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={list.tab}
              onClick={() => {
                setTab(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className={list.body}>
        {tab === 'overview' && request ? (
          <Overview
            path={path}
            request={request}
            prefix={prefix}
            report={report}
            onCheckout={onCheckout}
            onMerged={onClose}
          />
        ) : comparison.isError ? (
          <p className={list.notice} role="alert">
            {comparison.error.message} Fetch to bring the branches up to date, then open the review
            again.
          </p>
        ) : tab === 'files' ? (
          <FileChangeList
            label="Changed files"
            changes={comparison.data?.changes ?? []}
            onOpenFile={(file) => {
              if (!comparison.data) return;
              onOpenDiff({
                kind: 'compare',
                file,
                from: comparison.data.fork,
                to: comparison.data.head,
              });
            }}
          />
        ) : (
          <ul className={list.commits} aria-label="Commits">
            {comparison.data?.commits.map((commit) => (
              <li key={commit.id}>
                <div className={list.commit}>
                  <span className={list.sha}>{commit.shortId}</span>
                  <span className={list.summary}>{commit.summary}</span>
                  <span className={list.meta}>
                    {commit.author.name} · {formatCommitTime(commit.author.time)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface OverviewProps {
  path: string;
  request: PullRequest;
  prefix: string;
  report: Report;
  onCheckout: (request: PullRequest) => void;
  onMerged: () => void;
}

function Overview({ path, request, prefix, report, onCheckout, onMerged }: OverviewProps) {
  const review = usePullRequestReview(path, request.number);
  const action = useReviewAction(path, request.number);
  const [reply, setReply] = useState('');
  const name = `${prefix}${String(request.number)}`;
  const data = review.data;

  const sendReply = () => {
    if (reply.trim() === '' || action.isPending) return;
    action.mutate(
      { kind: 'comment', body: reply.trim() },
      {
        onSuccess: () => {
          setReply('');
        },
      },
    );
  };

  return (
    <div className={styles.overview}>
      <p className={styles.muted}>
        {request.author} wants to merge {request.sourceBranch} into {request.targetBranch}
        {request.draft ? ' (draft)' : ''}
      </p>
      {review.isError && (
        <p className={styles.error} role="alert">
          {review.error.message}
        </p>
      )}
      {data && (
        <>
          <p className={styles.description}>{data.description || 'No description.'}</p>
          <p className={styles.muted}>
            {data.approvedBy.length > 0
              ? `Approved by ${data.approvedBy.join(', ')}`
              : 'Not approved yet'}
          </p>
        </>
      )}
      <div className={styles.actions}>
        <Button
          size="sm"
          disabled={action.isPending}
          onClick={() => {
            action.mutate(
              { kind: 'approve' },
              {
                onSuccess: () => {
                  report('done', `Approved ${name}`);
                },
              },
            );
          }}
        >
          <Check size={14} aria-hidden />
          Approve
        </Button>
        <ConfirmButton
          variant="secondary"
          confirmLabel={`Merge ${name} on the server?`}
          disabled={action.isPending || data?.mergeable === false}
          onConfirm={() => {
            action.mutate(
              { kind: 'merge' },
              {
                onSuccess: () => {
                  report('done', `Merged ${name} into ${request.targetBranch}`);
                  onMerged();
                },
              },
            );
          }}
        >
          <GitMerge size={14} aria-hidden />
          {data?.mergeable === false ? 'Cannot merge yet' : 'Merge'}
        </ConfirmButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onCheckout(request);
          }}
        >
          <GitBranch size={14} aria-hidden />
          Check out {request.sourceBranch}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(request.url).catch(() => undefined);
            report('done', `Copied the link to ${name}`);
          }}
        >
          <Link size={14} aria-hidden />
          Copy link
        </Button>
      </div>
      {action.error && (
        <p className={styles.error} role="alert">
          {action.error.message}
        </p>
      )}
      <ul className={styles.comments} aria-label="Comments">
        {data?.comments.map((comment, index) => (
          <li key={`${comment.createdAt} ${String(index)}`} className={styles.comment}>
            <p className={styles.commentMeta}>
              <strong>{comment.author}</strong> · {new Date(comment.createdAt).toLocaleString()}
              {comment.file && (
                <>
                  {' · '}
                  <span className={styles.commentPlace}>
                    {comment.file}
                    {comment.line != null ? `:${String(comment.line)}` : ''}
                  </span>
                </>
              )}
            </p>
            <p className={styles.commentBody}>{comment.body}</p>
          </li>
        ))}
      </ul>
      <form
        className={styles.reply}
        aria-label="Reply"
        onSubmit={(event) => {
          event.preventDefault();
          sendReply();
        }}
      >
        <textarea
          className={styles.replyInput}
          aria-label="Comment"
          placeholder="Write a comment… (Ctrl+Enter sends)"
          value={reply}
          onChange={(event) => {
            setReply(event.target.value);
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              sendReply();
            }
          }}
        />
        <div className={styles.replyActions}>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={reply.trim() === '' || action.isPending}
          >
            Comment
          </Button>
        </div>
      </form>
    </div>
  );
}
