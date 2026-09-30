/**
 * DYDTT Phase 1 — Launch URL handling
 * No page routes (all navigation is in-app). Handles launch parameters:
 *   ?shortcut=today | ?shortcut=add   (manifest.json → shortcuts)
 *   ?date=YYYY-MM-DD                  (e.g. opened from a reminder notification)
 * Parameters are removed from the URL after use so a reload doesn't repeat them.
 */

import { store }    from './store.js';
import { todayStr } from './utils/dateHelpers.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const router = {
  init() {
    const params   = new URLSearchParams(window.location.search);
    const shortcut = params.get('shortcut');
    const date     = params.get('date');

    if (shortcut || date) {
      params.delete('shortcut');
      params.delete('date');
      const qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }

    if (date && DATE_RE.test(date)) {
      store.dispatch('NAV_TO_DATE', { date });
    }

    if (shortcut === 'today') {
      store.dispatch('NAV_TO_DATE', { date: todayStr() });
    } else if (shortcut === 'add') {
      store.dispatch('NAV_TO_DATE', { date: todayStr() });
      setTimeout(() => store.dispatch('MODAL_OPEN', { tab: 'edit' }), 300);
    }
  },
};
