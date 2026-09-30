/**
 * DYDTT Phase 1 — App Entry Point
 */

import './styles/tokens.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/animations.css';

import { openDb }              from './db/schema.js';
import { seed }                from './db/seed.js';
import { store }               from './store.js';
import { router }              from './router.js';
import { applyMotionPref }     from './utils/motionPrefs.js';
import { registerSW }          from './utils/sw.js';
import { initAuth }            from './auth/authManager.js';
import { initReminders }       from './push/reminders.js';
import BurgerMenu              from './components/BurgerMenu.js';
import DayView                 from './components/DayView.js';
import FortyEightHourView      from './components/FortyEightHourView.js';
import WeekGridView            from './components/WeekGridView.js';
import Modal                   from './components/Modal.js';

class ViewManager {
  #main = null; #currentView = null; #currentKey = null;
  constructor(main) { this.#main = main; }
  mount(viewKey) {
    if (viewKey === this.#currentKey) return;
    this.#currentView?.destroy?.();
    this.#main.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'view-root';
    this.#main.appendChild(container);
    switch (viewKey) {
      case '48h':      this.#currentView = new FortyEightHourView({ container }); break;
      case 'week3x3':  this.#currentView = new WeekGridView({ container });       break;
      default:         this.#currentView = new DayView({ container });            break;
    }
    this.#currentKey = viewKey;
  }
}

async function boot() {
  await openDb();
  if (import.meta.env.DEV) await seed();
  await store.init();
  applyMotionPref(store.state.settings.reducedMotion);

  // Initialise Firebase auth listener — fires before first render
  initAuth();

  const live = document.createElement('div');
  live.id = 'aria-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(live);

  const skip = document.createElement('a');
  skip.href = '#main-content';
  skip.className = 'sr-only sr-only-focusable';
  skip.textContent = 'Skip to content';
  document.body.prepend(skip);

  const app = document.getElementById('app');

  const topBar = document.createElement('header');
  topBar.className = 'top-bar';
  topBar.setAttribute('role', 'banner');
  app.appendChild(topBar);

  const burger = new BurgerMenu({ container: topBar });
  const modal  = new Modal({ container: app });

  // Burger clicks drive the modal; the burger icon follows the store's
  // modalOpen flag (covers Cancel, Esc, overlay click, ?shortcut=add, etc.)
  burger.on('open',  () => modal.open());
  burger.on('close', () => modal.close());
  store.subscribe('ui', (ui) => burger.setExpanded(ui.modalOpen));

  const main = document.createElement('main');
  main.id = 'main-content';
  main.setAttribute('role', 'main');
  app.appendChild(main);

  const viewManager = new ViewManager(main);
  viewManager.mount(store.state.settings.activeView ?? 'day');
  store.subscribe('settings', (s) => viewManager.mount(s.activeView ?? 'day'));

  router.init();
  if (!import.meta.env.DEV) registerSW();
  initReminders();

  console.info('[DYDTT] Boot complete.');
}

boot().catch((err) => {
  console.error('[DYDTT] Boot failed:', err);
  document.getElementById('app').innerHTML = `
    <div style="padding:2rem;color:#F5F5F5;font-family:system-ui">
      <h1 style="color:#C9A84C;margin-bottom:1rem">DYDTT failed to start</h1>
      <p>${err.message}</p>
    </div>`;
});
