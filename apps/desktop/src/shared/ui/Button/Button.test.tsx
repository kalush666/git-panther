import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
  it('defaults to a non-submitting secondary button', () => {
    render(<Button>Fetch</Button>);
    const button = screen.getByRole('button', { name: 'Fetch' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'secondary');
  });

  it('invokes onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Push</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Push' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignores clicks when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Pull
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pull' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
