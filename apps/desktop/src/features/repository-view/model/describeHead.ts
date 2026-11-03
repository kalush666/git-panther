import type { HeadDto } from '../../../shared/ipc';

/** A short human description of where HEAD points. */
export function describeHead(head: HeadDto): string {
  switch (head.kind) {
    case 'branch':
      return `On branch ${head.name}`;
    case 'detached':
      return `Detached at ${head.commit}`;
    case 'unborn':
      return `On branch ${head.name}, no commits yet`;
  }
}
