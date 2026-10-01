/**
 * DYDTT — Top bar while viewing someone else's calendar
 * Their picture + name on the left, an X on the right instead of the burger.
 */

import { store }        from '../store.js';
import { avatarEl }     from '../social/avatar.js';
import { closeShared }  from '../social/social.js';
import { showToast }    from '../utils/toast.js';
import { announce }     from '../utils/a11y.js';

export default class SharedBar {
  #bar;
  #burger;
  #unsubs = [];

  /** @param {{ container: HTMLElement, burgerEl: HTMLElement }} opts */
  constructor({ container, burgerEl }) {
    this.#burger = burgerEl;
    this.#bar = document.createElement('div');
    this.#bar.className = 'shared-bar';
    this.#bar.hidden = true;
    container.prepend(this.#bar);

    let lastBlocked = store.state.navBlocked;   // only react to new refusals
    this.#unsubs.push(
      store.subscribe('viewing', (v) => this.#render(v)),
      store.subscribe('navBlocked', (b) => {
        if (!b || b === lastBlocked) return;
        lastBlocked = b;
        showToast({ message: 'Friends share only yesterday, today and tomorrow.', timeout: 3000 });
      }),
    );
  }

  #render(viewing) {
    this.#bar.replaceChildren();
    this.#bar.hidden = !viewing;
    this.#burger.hidden = Boolean(viewing);
    if (!viewing) return;

    const who = document.createElement('div');
    who.className = 'shared-bar__who';
    const text = document.createElement('div');
    text.className = 'shared-bar__text';
    const name = document.createElement('span');
    name.className = 'shared-bar__name';
    name.textContent = `${viewing.name}'s tasks`;
    const kind = document.createElement('span');
    kind.className = 'shared-bar__kind';
    kind.textContent = viewing.level === 'family' ? 'Family · you can tick tasks off' : 'Friend · yesterday, today & tomorrow';
    text.append(name, kind);
    who.append(avatarEl(viewing, 32), text);

    const x = document.createElement('button');
    x.className = 'shared-bar__close';
    x.type = 'button';
    x.setAttribute('aria-label', `Close ${viewing.name}'s calendar`);
    x.textContent = '×';
    x.addEventListener('click', async () => {
      await closeShared();
      announce('Back to your calendar');
    });

    this.#bar.append(who, x);
    announce(`Viewing ${viewing.name}'s tasks`);
  }

  destroy() { this.#unsubs.forEach(u => u()); }
}
