import { SYSTEMS } from '../core/systems';
import type { Simulation } from '../core/simulation';
import { h } from './dom';

/**
 * Systems window: status of the ATC and airport systems (A-SMGCS services,
 * A-CDM, datalink) with switches, like a technical supervisor position.
 */
export function showSystems(sim: Simulation, onChange: () => void): void {
  document.querySelector('.overlay.systems')?.remove();
  const body = h('div.dbody');
  const render = () => {
    const groups = [...new Set(SYSTEMS.map((s) => s.group))];
    body.replaceChildren(
      h('div.sub', { text: `Systems at ${sim.config.airport.icao}. Switching a system off simulates maintenance or a failure - train how to work without it.` }),
      ...groups.map((g) =>
        h(
          'div',
          {},
          h('h2', { text: g }),
          ...SYSTEMS.filter((s) => s.group === g).map((s) => {
            const available = !sim.config.airport.systems || sim.config.airport.systems.includes(s.id);
            const on = sim.systemOn(s.id);
            const toggle = h('button', { type: 'button', text: on ? 'ON' : 'OFF', class: on ? 'active' : '', disabled: !available, title: on ? 'Switch off' : 'Switch on' });
            toggle.addEventListener('click', () => {
              sim.setSystem(s.id, !on);
              onChange();
              render();
            });
            return h(
              'div.sysrow',
              {},
              h(`span.lamp.${!available ? 'na' : on ? 'on' : 'off'}`),
              h(
                'div.sysinfo',
                {},
                h('div.sysname', { text: `${s.name}${available ? '' : ' (not installed here)'}` }),
                h('div.sub', { text: on ? s.description : `OFF: ${s.whenOff}` }),
              ),
              toggle,
            );
          }),
        ),
      ),
    );
  };
  const close = h('button', { type: 'button', text: 'Close' });
  const overlay = h('div.overlay.systems', {}, h('div.dialog', {}, h('div.dtitle', {}, h('span', { text: 'SYSTEMS' }), close), body));
  close.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => e.target === overlay && overlay.remove());
  render();
  document.body.append(overlay);
}
