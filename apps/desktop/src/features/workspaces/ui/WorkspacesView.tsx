import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FolderPlus, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ipc, unwrap } from '../../../shared/ipc';
import { Button } from '../../../shared/ui/Button/Button';
import { ConfirmButton } from '../../../shared/ui/ConfirmButton/ConfirmButton';
import { InlinePrompt } from '../../../shared/ui/InlinePrompt/InlinePrompt';
import { useWorkspacesStore, type Workspace } from '../model/workspacesStore';
import styles from './WorkspacesView.module.css';

interface WorkspacesViewProps {
  /** Repositories open in tabs now, offered when creating a workspace. */
  openPaths: string[];
  onOpenRepository: (path: string) => void;
  onClose: () => void;
}

type Prompt = { kind: 'create' } | { kind: 'rename'; workspace: Workspace };

/**
 * Groups of repositories on one page: each repository's branch, and the
 * merge requests and issues of every connected server together.
 */
export function WorkspacesView({ openPaths, onOpenRepository, onClose }: WorkspacesViewProps) {
  const store = useWorkspacesStore();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const workspace =
    store.workspaces.find((candidate) => candidate.id === store.selectedId) ?? store.workspaces[0];

  const addRepository = async () => {
    if (!workspace) return;
    const folder = await ipc.pickFolder('Add a repository to the workspace');
    if (!folder) return;
    const opened = await ipc.openRepository(folder);
    if (opened.status === 'ok') store.addPaths(workspace.id, [opened.data.path]);
  };

  return (
    <section className={styles.view} aria-label="Workspaces">
      <header className={styles.header}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Back
        </Button>
        <h1 className={styles.title}>Workspaces</h1>
        {store.workspaces.length > 0 && (
          <select
            className={styles.picker}
            aria-label="Workspace"
            value={workspace?.id ?? ''}
            onChange={(event) => {
              store.select(event.target.value);
            }}
          >
            {store.workspaces.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        )}
        <span className={styles.spacer} />
        {workspace && (
          <>
            <Button size="sm" variant="ghost" onClick={() => void addRepository()}>
              <FolderPlus size={14} aria-hidden />
              Add repository
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={openPaths.every((path) => workspace.paths.includes(path))}
              onClick={() => {
                store.addPaths(workspace.id, openPaths);
              }}
            >
              Add open tabs
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPrompt({ kind: 'rename', workspace });
              }}
            >
              Rename
            </Button>
            <ConfirmButton
              confirmLabel={`Remove ${workspace.name}?`}
              onConfirm={() => {
                store.remove(workspace.id);
              }}
            >
              Remove
            </ConfirmButton>
          </>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPrompt({ kind: 'create' });
          }}
        >
          <Plus size={14} aria-hidden />
          New workspace
        </Button>
      </header>
      {prompt?.kind === 'create' && (
        <InlinePrompt
          title={`New workspace${openPaths.length > 0 ? ' with the open tabs' : ''}`}
          fields={[{ label: 'Workspace name', initial: '', placeholder: 'Payments team' }]}
          submitLabel="Create"
          error={null}
          isPending={false}
          onCancel={() => {
            setPrompt(null);
          }}
          onSubmit={([name = '']) => {
            store.create(name, openPaths);
            setPrompt(null);
          }}
        />
      )}
      {prompt?.kind === 'rename' && (
        <InlinePrompt
          key={prompt.workspace.id}
          title={`Rename ${prompt.workspace.name}`}
          fields={[{ label: 'Workspace name', initial: prompt.workspace.name }]}
          submitLabel="Rename"
          error={null}
          isPending={false}
          onCancel={() => {
            setPrompt(null);
          }}
          onSubmit={([name = '']) => {
            store.rename(prompt.workspace.id, name);
            setPrompt(null);
          }}
        />
      )}
      {!workspace ? (
        <p className={styles.hint}>
          A workspace groups repositories you work on together, so their branches, merge requests
          and issues show on one page. Create one from the repositories open in tabs.
        </p>
      ) : workspace.paths.length === 0 ? (
        <p className={styles.hint}>No repositories yet: add one, or add the open tabs.</p>
      ) : (
        <ul className={styles.cards} aria-label={`Repositories in ${workspace.name}`}>
          {workspace.paths.map((path) => (
            <RepositoryCard
              key={path}
              path={path}
              onOpen={() => {
                onOpenRepository(path);
              }}
              onRemove={() => {
                store.removePath(workspace.id, path);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Network answers refresh now and then, not on every visit. */
const REVIEW_STALE_MS = 60_000;

function RepositoryCard({
  path,
  onOpen,
  onRemove,
}: {
  path: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const summary = useQuery({
    queryKey: ['workspace', path, 'summary'],
    queryFn: async () => unwrap(await ipc.refreshRepository(path)),
  });
  const hosting = useQuery({
    queryKey: ['hosting', path, 'status'],
    queryFn: async () => unwrap(await ipc.hostingStatus(path)),
  });
  const connected = hosting.data?.kind != null;
  const requests = useQuery({
    queryKey: ['hosting', path, 'pullRequests'],
    queryFn: async () => unwrap(await ipc.listPullRequests(path)),
    enabled: connected,
    staleTime: REVIEW_STALE_MS,
  });
  const issues = useQuery({
    queryKey: ['hosting', path, 'issues'],
    queryFn: async () => unwrap(await ipc.listIssues(path)),
    enabled: connected,
    staleTime: REVIEW_STALE_MS,
  });
  const head = summary.data?.head;
  const name = summary.data?.name ?? path.split(/[\\/]/).pop() ?? path;
  const prefix = hosting.data?.kind === 'gitHub' ? '#' : '!';

  return (
    <li className={styles.card} aria-label={name}>
      <div className={styles.cardHeader}>
        <button type="button" className={styles.repoName} title={`Open ${path}`} onClick={onOpen}>
          {name}
        </button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove ${name} from the workspace`}
          onClick={onRemove}
        >
          <X size={13} aria-hidden />
        </Button>
      </div>
      <p className={styles.meta} title={path}>
        {summary.isError
          ? summary.error.message
          : head?.kind === 'detached'
            ? `Detached at ${head.commit.slice(0, 7)}`
            : head
              ? `On ${head.name}`
              : '…'}
      </p>
      {!hosting.data ? null : !connected ? (
        <p className={styles.meta}>Open it and connect {hosting.data.server} to see its reviews.</p>
      ) : (
        <>
          <h3 className={styles.listTitle}>
            {hosting.data.kind === 'gitHub' ? 'Pull requests' : 'Merge requests'} (
            {requests.data?.length ?? '…'})
          </h3>
          <ul className={styles.items} aria-label={`Merge requests of ${name}`}>
            {requests.data?.map((request) => (
              <li key={request.number} className={styles.item} title={request.title}>
                {prefix}
                {request.number} {request.title}
              </li>
            ))}
          </ul>
          <h3 className={styles.listTitle}>Issues ({issues.data?.length ?? '…'})</h3>
          <ul className={styles.items} aria-label={`Issues of ${name}`}>
            {issues.data?.map((issue) => (
              <li key={issue.number} className={styles.item} title={issue.title}>
                #{issue.number} {issue.title}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}
