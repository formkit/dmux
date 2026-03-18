export interface DmuxHelperSubscribeMessage {
  type: 'subscribe';
  instanceId: string;
  titleToken: string;
  bundleId?: string;
  terminalProgram?: string;
}

export interface DmuxHelperNotifyMessage {
  type: 'notify';
  title: string;
  subtitle?: string;
  body: string;
  soundName?: string;
  titleToken?: string;
  bundleId?: string;
  tmuxPaneId?: string;
  tmuxSocketPath?: string;
}

export interface DmuxHelperPreviewSoundMessage {
  type: 'preview-sound';
  soundName?: string;
}

export interface DmuxHelperFocusStateMessage {
  type: 'focus-state';
  instanceId: string;
  fullyFocused: boolean;
  accessibilityTrusted: boolean;
  matchedTitleToken: boolean;
  frontmostAppBundleId?: string;
  focusedWindowTitle?: string;
}

export function buildFocusToken(instanceId: string): string {
  const compactId = instanceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return `dmx-${compactId}`;
}

export function buildFocusWindowTitle(projectName: string, token: string): string {
  const cleanProjectName = projectName.trim() || 'dmux';
  return `dmux ${cleanProjectName} [${token}]`;
}

export function buildTerminalTitleSequence(title: string, insideTmux: boolean): string {
  const osc = `\u001b]2;${title}\u0007`;
  if (!insideTmux) {
    return osc;
  }

  const escapedOsc = osc.replace(/\u001b/g, '\u001b\u001b');
  return `\u001bPtmux;${escapedOsc}\u001b\\`;
}

export function mapTerminalProgramToBundleId(termProgram?: string): string | undefined {
  if (!termProgram) {
    return undefined;
  }

  switch (termProgram.trim().toLowerCase()) {
    case 'Apple_Terminal':
    case 'apple_terminal':
      return 'com.apple.Terminal';
    case 'iTerm.app':
    case 'iTerm2':
    case 'iTerm':
    case 'iterm.app':
    case 'iterm2':
    case 'iterm':
      return 'com.googlecode.iterm2';
    case 'WezTerm':
    case 'wezterm':
      return 'com.github.wez.wezterm';
    case 'Ghostty':
    case 'ghostty':
      return 'com.mitchellh.ghostty';
    case 'WarpTerminal':
    case 'Warp':
    case 'warpterminal':
    case 'warp':
      return 'dev.warp.Warp-Stable';
    default:
      return undefined;
  }
}

export function parseTmuxSocketPath(tmuxEnv?: string): string | undefined {
  if (!tmuxEnv) {
    return undefined;
  }

  const socketPath = tmuxEnv.split(',')[0]?.trim();
  return socketPath || undefined;
}

export function supportsNativeDmuxHelper(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin';
}
