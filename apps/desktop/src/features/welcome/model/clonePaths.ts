/** The folder name `git clone` would pick for `url`, e.g. `app` for `…/app.git`. */
export function repositoryNameFromUrl(url: string): string {
  const withoutSuffix = url
    .trim()
    .replace(/[\\/]+$/, '')
    .replace(/\.git$/i, '');
  return (
    withoutSuffix
      .split(/[\\/:]/)
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

/** Joins a folder and a child name using the folder's own separator style. */
export function joinPath(folder: string, child: string): string {
  const separator = folder.includes('\\') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${child}`;
}
