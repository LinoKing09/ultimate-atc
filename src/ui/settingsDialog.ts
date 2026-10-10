import type { Simulation } from '../core/simulation';
import { h } from './dom';
import { defaultSettings, saveSettings, type Settings } from './settings';

const PHONE_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="18.5" r="1" fill="currentColor"/></svg>';
const LAPTOP_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="22" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.8"/></svg>';

/** Recognition languages offered in the settings (accents of English). */
const VOICE_LANGS: [string, string][] = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)'],
  ['en-IE', 'English (Ireland)'],
];

/**
 * In-game settings menu. Every change is applied immediately (via `apply`)
 * and stored in the browser.
 */
export function showSettings(sim: Simulation, settings: Settings, apply: () => void, voice: { tts: boolean; mic: boolean; hidden?: boolean; test?: () => void }): void {
  if (document.querySelector('.overlay')) return;
  const changed = () => {
    saveSettings(settings);
    apply();
  };

  // ---------------------------------------------------------------- controls
  const check = (key: 'events' | 'tts' | 'voiceAutoSend' | 'showRoutes', disabled = false) => {
    const el = h('input', { type: 'checkbox', disabled });
    el.checked = settings[key];
    el.addEventListener('change', () => {
      settings[key] = el.checked;
      changed();
    });
    return el;
  };
  const ttsRow = () => {
    const test = h('button', { type: 'button', text: 'Test', disabled: !voice.tts, title: 'Speak a test phrase' });
    test.addEventListener('click', () => voice.test?.());
    return h('span', {}, check('tts', !voice.tts), ' ', test);
  };
  const range = (key: 'uiScale' | 'tagScale' | 'ttsRate' | 'ttsVolume', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const el = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    el.value = String(settings[key]);
    const out = h('span.val', { text: fmt(settings[key]) });
    el.addEventListener('input', () => {
      settings[key] = Number(el.value);
      out.textContent = fmt(settings[key]);
      changed();
    });
    return h('div.rangerow', {}, el, out);
  };
  const select = <T extends string>(value: T, options: [T, string][], set: (v: T) => void) => {
    const el = h('select');
    for (const [v, label] of options) el.append(h('option', { value: v, text: label }));
    el.value = value;
    el.addEventListener('change', () => {
      set(el.value as T);
      changed();
    });
    return el;
  };
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  // Device switch: phone on the left, laptop on the right.
  const device = h('input', { type: 'range', min: '0', max: '1', step: '1', class: 'device-slider', 'aria-label': 'Device layout: mobile or PC' });
  device.value = settings.device === 'mobile' ? '0' : '1';
  const phone = h('span.devicon', { html: PHONE_ICON, title: 'Mobile (touch: iPad, tablet, phone)' });
  const laptop = h('span.devicon', { html: LAPTOP_ICON, title: 'PC (mouse and keyboard)' });
  const deviceLabel = h('span.val');
  const syncDevice = () => {
    phone.classList.toggle('on', settings.device === 'mobile');
    laptop.classList.toggle('on', settings.device === 'pc');
    deviceLabel.textContent = settings.device === 'mobile' ? 'Mobile' : 'PC';
  };
  const setDevice = (d: Settings['device']) => {
    settings.device = d;
    device.value = d === 'mobile' ? '0' : '1';
    syncDevice();
    changed();
  };
  device.addEventListener('input', () => setDevice(device.value === '0' ? 'mobile' : 'pc'));
  phone.addEventListener('click', () => setDevice('mobile'));
  laptop.addEventListener('click', () => setDevice('pc'));
  syncDevice();

  const section = (title: string, ...rows: [string, HTMLElement, string?][]) =>
    h(
      'div',
      {},
      h('h2', { text: title }),
      h('div.grid', {}, ...rows.flatMap(([label, el, hint]) => [h('label', { text: label, title: hint }), el])),
    );

  const close = h('button.primary', { type: 'button', text: 'Close' });
  const reset = h('button', { type: 'button', text: 'Reset to defaults' });

  const dialog = h(
    'div.dialog.settings',
    {},
    h('div.dtitle', {}, h('span', { text: 'SETTINGS' })),
    h(
      'div.dbody',
      {},
      h('div.sub', { text: 'Changes apply immediately and are stored in this browser.' }),
      section(
        'Display',
        ['Device', h('div.device', {}, phone, device, laptop, deviceLabel), 'Mobile: +/- zoom buttons, larger touch targets, tap twice (or long-press) for the aircraft menu, quick-action bar'],
        ['Interface size', range('uiScale', 0.8, 1.6, 0.05, pct)],
        ['Tag size', range('tagScale', 0.8, 2, 0.05, pct)],
        [
          'Scope orientation',
          select(settings.runwayAligned ? 'runway' : 'north', [
            ['runway', 'Runway horizontal (chart)'],
            ['north', 'North up'],
          ], (v) => (settings.runwayAligned = v === 'runway')),
        ],
        ['Show cleared routes', check('showRoutes')],
      ),
      ...(voice.hidden
        ? []
        : [
          section(
            'Voice',
            ['Pilot voices (TTS)', ttsRow()],
            ['Voice volume', range('ttsVolume', 0, 1, 0.05, pct)],
            ['Voice speed', range('ttsRate', 0.7, 1.5, 0.05, pct)],
            ['Send voice automatically', check('voiceAutoSend', !voice.mic), 'Transmit the recognised instruction as soon as you release push-to-talk'],
            ['Recognition accent', select(settings.voiceLang, VOICE_LANGS, (v) => (settings.voiceLang = v))],
          ),
          ]),
      section(
        'Traffic',
        [
          'Traffic density',
          select(settings.density, [
            ['light', 'Light'],
            ['medium', 'Medium'],
            ['heavy', 'Heavy'],
          ], (v) => (settings.density = v)),
          'Applies to new traffic from now on',
        ],
        ['Special events', check('events'), 'Medical emergencies and rejected take-offs (low probability)'],
      ),
      h('div.actions', {}, reset, close),
    ),
  );
  const overlay = h('div.overlay', {}, dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
  close.addEventListener('click', () => overlay.remove());
  reset.addEventListener('click', () => {
    const keep = { airport: settings.airport, position: settings.position };
    Object.assign(settings, defaultSettings(), keep);
    changed();
    overlay.remove();
    showSettings(sim, settings, apply, voice);
  });
  document.body.append(overlay);
  close.focus();
}
