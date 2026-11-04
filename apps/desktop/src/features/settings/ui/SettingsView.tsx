import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  CODE_FONTS,
  INTERFACE_SIZES,
  useAppearanceStore,
} from '../../../shared/preferences/appearance';
import { AUTO_FETCH_CHOICES, useAutoFetchStore } from '../../../shared/preferences/autoFetch';
import { DEFAULT_EDITOR, useEditorStore } from '../../../shared/preferences/editor';
import { PULL_STRATEGIES, usePullStrategyStore } from '../../../shared/preferences/pullStrategy';
import { THEME_PREFERENCES, useThemeStore } from '../../../shared/preferences/theme';
import { Button } from '../../../shared/ui/Button/Button';
import { AccountsSetting } from './AccountsSetting';
import { GitExecutableSetting } from './GitExecutableSetting';
import { IdentitiesSetting } from './IdentitiesSetting';
import { ShortcutsSetting } from './ShortcutsSetting';
import { SegmentedControl } from './SegmentedControl';
import styles from './SettingsView.module.css';

interface SettingsViewProps {
  onClose: () => void;
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const theme = useThemeStore((state) => state.preference);
  const setTheme = useThemeStore((state) => state.setPreference);
  const interfaceScale = useAppearanceStore((state) => state.interfaceScale);
  const setInterfaceScale = useAppearanceStore((state) => state.setInterfaceScale);
  const codeFont = useAppearanceStore((state) => state.codeFont);
  const setCodeFont = useAppearanceStore((state) => state.setCodeFont);
  const pullStrategy = usePullStrategyStore((state) => state.strategy);
  const setPullStrategy = usePullStrategyStore((state) => state.setStrategy);
  const autoFetch = useAutoFetchStore((state) => state.minutes);
  const setAutoFetch = useAutoFetchStore((state) => state.setMinutes);

  return (
    <section className={styles.view} aria-labelledby="settings-title">
      <header className={styles.header}>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} aria-hidden />
          Back
        </Button>
        <h1 id="settings-title" className={styles.title}>
          Settings
        </h1>
      </header>
      <div className={styles.groups}>
        <Group title="Appearance">
          <Row label="Theme">
            <SegmentedControl
              label="Theme"
              options={THEME_PREFERENCES}
              value={theme}
              onChange={setTheme}
            />
          </Row>
          <Row label="Interface size">
            <SegmentedControl
              label="Interface size"
              options={INTERFACE_SIZES.map(({ scale, label }) => ({ value: scale, label }))}
              value={interfaceScale}
              onChange={setInterfaceScale}
            />
          </Row>
          <Row label="Code font" hint="Used for diffs, commit SHAs and file paths.">
            <SegmentedControl
              label="Code font"
              options={CODE_FONTS.map(({ id, label }) => ({ value: id, label }))}
              value={codeFont}
              onChange={setCodeFont}
            />
          </Row>
        </Group>
        <Group title="Accounts">
          <Row
            label="HTTPS git servers"
            hint="Sign in with your personal number and password. The password is kept by your git credential manager."
          >
            <AccountsSetting />
          </Row>
        </Group>
        <Group title="Identities">
          <Row
            label="Commit as"
            hint="Switch a repository to one of these from its commit box. Signing keys sign every commit."
          >
            <IdentitiesSetting />
          </Row>
        </Group>
        <Group title="Git">
          <Row
            label="Code editor"
            hint="Opens a repository from its Open in menu: a command like code, or the editor's full path."
          >
            <EditorSetting />
          </Row>
          <Row
            label="Git executable"
            hint="Git Panther runs your installed git, with your credentials and config."
          >
            <GitExecutableSetting />
          </Row>
          <Row
            label="Fetch automatically"
            hint="Keeps to-pull counts current while Git Panther is in front."
          >
            <SegmentedControl
              label="Fetch automatically"
              options={AUTO_FETCH_CHOICES}
              value={autoFetch}
              onChange={setAutoFetch}
            />
          </Row>
          <Row
            label="Pull"
            hint={PULL_STRATEGIES.find(({ id }) => id === pullStrategy)?.hint ?? ''}
          >
            <SegmentedControl
              label="Pull"
              options={PULL_STRATEGIES.map(({ id, label }) => ({ value: id, label }))}
              value={pullStrategy}
              onChange={setPullStrategy}
            />
          </Row>
        </Group>
        <Group title="Keyboard">
          <Row label="Shortcuts" hint="Ctrl+K opens the command palette for everything else.">
            <ShortcutsSetting />
          </Row>
        </Group>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

function EditorSetting() {
  const command = useEditorStore((state) => state.command);
  const setCommand = useEditorStore((state) => state.setCommand);
  return (
    <div className={styles.pathRow}>
      <input
        className={styles.input}
        aria-label="Code editor"
        placeholder={DEFAULT_EDITOR}
        spellCheck={false}
        value={command}
        onChange={(event) => {
          setCommand(event.target.value);
        }}
      />
    </div>
  );
}
