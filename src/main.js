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
import { initSync }            from './sync/index.js';
import { initSocial }          from './social/social.js';
import SharedBar               from './components/SharedBar.js';
import { createMascot }        from './components/Mascot.js';
import { openSecretPage }      from './components/SecretPage.js';
import { createPetBowl }       from './components/PetBowl.js';
import { createDayArrows }     from './components/DayArrows.js';
import { initDesktopMode, setViewAttr } from './utils/desktopMode.js';
import { initPet }             from './pet/petStore.js';
import { isNative }            from './platform.js';
import { initNative }          from './native/index.js';
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
    setViewAttr(viewKey === '48h' || viewKey === 'week3x3' ? viewKey : 'day');
  }
}

async function boot() {
  await openDb();
  if (import.meta.env.DEV) await seed();
  await store.init();
  applyMotionPref(store.state.settings.reducedMotion);
  initDesktopMode();

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
  // The cat lying on the top bar's line, watching over the calendar
  // Tap him 14 times: in the Android app he opens his eyes and shows his secret page;
  // on the website he keeps them shut and just purrs.
  topBar.appendChild(createMascot({
    scale:       2,
    canOpenEyes: isNative(),
    onSecret:    openSecretPage,
  }));
  // Once his secret page has been found, a little food bowl next to him opens the cat game
  if (isNative()) topBar.appendChild(createPetBowl({ scale: 2, onOpen: openSecretPage }));

  const burger = new BurgerMenu({ container: topBar });
  const modal  = new Modal({ container: app });

  // Burger clicks drive the modal; the burger icon follows the store's
  // modalOpen flag (covers Cancel, Esc, overlay click, ?shortcut=add, etc.)
  burger.on('open',  () => modal.open());
  burger.on('close', () => modal.close());
  store.subscribe('ui', (ui) => burger.setExpanded(ui.modalOpen));

  // Viewing a friend's / family member's calendar: their name + X replace the burger
  new SharedBar({ container: topBar, burgerEl: topBar.querySelector('.burger-btn') });

  const main = document.createElement('main');
  main.id = 'main-content';
  main.setAttribute('role', 'main');
  app.appendChild(main);

  const viewManager = new ViewManager(main);
  viewManager.mount(store.state.settings.activeView ?? 'day');
  store.subscribe('settings', (s) => viewManager.mount(s.activeView ?? 'day'));

  // Desktop Mode: ‹ › arrows at the screen edges change the day
  app.appendChild(createDayArrows());

  router.init();
  // Android app: files are already on the phone — no service worker; OS reminders instead
  // The cat game's state (the Android app loads it in initNative, before its daily hello).
  // The website never shows the game, but once he's been found it still earns coins for ticked tasks.
  if (!isNative()) initPet().catch(err => console.error('[Pet] init failed', err));
  if (isNative()) {
    initNative().catch(err => console.error('[Native] init failed', err));
  } else if (!import.meta.env.DEV) {
    registerSW();
  }
  initReminders();
  // Cloud sync (Firestore is loaded only once someone signs in)
  initSync().catch(err => console.error('[Sync] init failed', err));
  // Friends & Family (profile, code, connections)
  initSocial().catch(err => console.error('[Social] init failed', err));

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
