import { FolderGit2, Star, X } from 'lucide-react';

import type { RecentRepositoryDto } from '../../../shared/ipc';
import { useFavoritesStore } from '../../../shared/preferences/favorites';
import { useRecentRepositories, useRemoveRecentRepository } from '../api/useRepositoryActions';
import styles from './RecentRepositories.module.css';

interface RecentRepositoriesProps {
  onSelect: (repository: RecentRepositoryDto) => void;
}

/** Starred repositories first (Ctrl+Alt+1–9), then the recently opened ones. */
export function RecentRepositories({ onSelect }: RecentRepositoriesProps) {
  const recent = useRecentRepositories();
  const remove = useRemoveRecentRepository();
  const favorites = useFavoritesStore((state) => state.favorites);
  const toggle = useFavoritesStore((state) => state.toggle);
  const isFavorite = (path: string) => favorites.some((favorite) => favorite.path === path);
  const others = (recent.data ?? []).filter((repository) => !isFavorite(repository.path));

  const row = (repository: RecentRepositoryDto, removable: boolean, position?: number) => (
    <li key={repository.path} className={styles.item}>
      <button
        type="button"
        className={styles.star}
        aria-pressed={isFavorite(repository.path)}
        aria-label={`${isFavorite(repository.path) ? 'Unstar' : 'Star'} ${repository.name}`}
        title={
          position === undefined
            ? 'Star to keep it at the top'
            : `Favorite ${String(position)} · Ctrl+Alt+${String(position)}`
        }
        onClick={() => {
          toggle({ path: repository.path, name: repository.name });
        }}
      >
        <Star size={14} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.open}
        title={repository.path}
        onClick={() => {
          onSelect(repository);
        }}
      >
        <FolderGit2 size={16} strokeWidth={1.75} aria-hidden />
        <span className={styles.name}>{repository.name}</span>
        <span className={styles.path}>{repository.path}</span>
      </button>
      {removable && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove ${repository.name} from recent`}
          onClick={() => {
            remove.mutate(repository.path);
          }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </li>
  );

  return (
    <>
      {favorites.length > 0 && (
        <section className={styles.section} aria-labelledby="favorites-title">
          <h2 id="favorites-title" className={styles.heading}>
            Favorites
          </h2>
          <ul className={styles.list}>
            {favorites.map((favorite, index) =>
              row({ path: favorite.path, name: favorite.name }, false, index + 1),
            )}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section className={styles.section} aria-labelledby="recent-title">
          <h2 id="recent-title" className={styles.heading}>
            Recent
          </h2>
          <ul className={styles.list}>{others.map((repository) => row(repository, true))}</ul>
        </section>
      )}
    </>
  );
}
