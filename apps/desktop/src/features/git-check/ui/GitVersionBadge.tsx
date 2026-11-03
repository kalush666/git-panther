import { useGitInstallation } from '../api/useGitInstallation';

export function GitVersionBadge() {
  const { data } = useGitInstallation();
  if (data?.status !== 'supported') {
    return null;
  }
  return <span>git {data.version}</span>;
}
