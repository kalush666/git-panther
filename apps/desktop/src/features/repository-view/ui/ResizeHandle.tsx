import type { KeyboardEvent, PointerEvent } from 'react';

import { PANEL_LIMITS, usePanelWidths, type Panel } from '../model/workspace';
import styles from './ResizeHandle.module.css';

/** Pixels an arrow key moves the edge. */
const KEY_STEP = 16;

interface ResizeHandleProps {
  panel: Panel;
  label: string;
  /** The panel's width now, read from the page when dragging starts. */
  currentWidth: () => number;
  /** `1` when the panel is left of the handle (dragging right widens it), `-1` when right. */
  direction: 1 | -1;
}

/**
 * A draggable edge between panels. Arrow keys nudge it, a double-click puts
 * the default width back.
 */
export function ResizeHandle({ panel, label, currentWidth, direction }: ResizeHandleProps) {
  const width = usePanelWidths((state) => state[panel]);
  const setWidth = usePanelWidths((state) => state.setWidth);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = currentWidth();
    const onMove = (move: globalThis.PointerEvent) => {
      setWidth(panel, startWidth + direction * (move.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.removeProperty('cursor');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.setProperty('cursor', 'col-resize');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const sign = event.key === 'ArrowRight' ? 1 : -1;
    setWidth(panel, currentWidth() + direction * sign * KEY_STEP);
  };

  return (
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={PANEL_LIMITS[panel].min}
      aria-valuemax={PANEL_LIMITS[panel].max}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        setWidth(panel, null);
      }}
    />
  );
}
