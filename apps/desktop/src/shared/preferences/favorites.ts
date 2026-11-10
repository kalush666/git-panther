import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FavoriteRepository {
  path: string;
  name: string;
}

interface FavoritesState {
  /** In the order they were starred; Ctrl+Alt+1–9 open the first nine. */
  favorites: FavoriteRepository[];
  toggle: (repository: FavoriteRepository) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favorites: [],
      toggle: (repository) => {
        set((state) => ({
          favorites: state.favorites.some((favorite) => favorite.path === repository.path)
            ? state.favorites.filter((favorite) => favorite.path !== repository.path)
            : [...state.favorites, repository],
        }));
      },
    }),
    { name: 'git-panther.favorites' },
  ),
);
