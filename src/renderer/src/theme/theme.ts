/**
 * Theme tokens for Bunny Media Hub.
 *
 * The renderer reads these values from CSS custom properties (theme.css), so a
 * future BunnyOS appearance service can override them at runtime — either by
 * setting `--accent` (as the Settings view does today) or by replacing the
 * whole token set. Nothing in the UI hard-codes a colour outside this file and
 * the stylesheets.
 */

export interface ThemeTokens {
  background: string
  backgroundDeep: string
  panel: string
  panelRaised: string
  line: string
  lineStrong: string
  text: string
  textDim: string
  textFaint: string
  accent: string
  danger: string
  warning: string
}

export const DARK_THEME: ThemeTokens = {
  background: '#0a0d0c',
  backgroundDeep: '#070908',
  panel: '#111614',
  panelRaised: '#161d1a',
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.13)',
  text: '#edf2ef',
  textDim: '#a3b0aa',
  textFaint: '#7e8c86',
  accent: '#3ddc84',
  danger: '#ff6b6b',
  warning: '#f2c46b'
}

export const ACCENT_PRESETS: Array<{ name: string; value: string }> = [
  { name: 'Bunny Green', value: '#3ddc84' },
  { name: 'Mint', value: '#5ee6c2' },
  { name: 'Lime', value: '#a8e05f' },
  { name: 'Amber', value: '#e9b44c' },
  { name: 'Coral', value: '#ff8a73' },
  { name: 'Periwinkle', value: '#8fa6ff' }
]

export function applyAccent(accent: string): void {
  document.documentElement.style.setProperty('--accent', accent)
}
