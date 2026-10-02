/**
 * DYDTT — Android app glue (only runs inside the Capacitor app)
 *   • notification channel + "Done" action, tap → open the task's day
 *   • ask for notification permission, and exact-alarm access (Android 12+)
 *   • hardware back button: close dialog → close menu → leave shared calendar → minimise
 *   • re-check reminders and the day when the app comes back to the front
 *   • the cat game: a daily hello notification once he's been found; tap → his page
 */

import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { store } from '../store.js';
import { setupNotifications, notificationPermission, exactAlarmsAllowed, openExactAlarmSettings } from './notifications.js';
import { setNativePermission } from '../push/client.js';
import { scheduleReminders, openTask } from '../push/reminders.js';
import { closeShared } from '../social/social.js';
import { getSetting, setSetting } from '../db/schema.js';
import { todayStr } from '../utils/dateHelpers.js';
import { showToast } from '../utils/toast.js';
import { isSecretOpen, secretBack, openSecretPage } from '../components/SecretPage.js';
import { initPet, getPet, refreshPet } from '../pet/petStore.js';
import { notificationText } from '../pet/pet.js';
import { sayHelloOncePerDay, setupPetChannel } from './petNotify.js';

export async function initNative() {
  document.documentElement.classList.add('native-app');
  await setupNotifications();
  await setupPetChannel();

  // Reminders are on by default in the app; ask Android once
  if ((await getSetting('pushEnabled')) === null) {
    await store.dispatch('SETTING_SET', { key: 'pushEnabled', value: true });
  }
  let perm = await notificationPermission(false);
  if (perm === 'default' && store.state.settings.pushEnabled) perm = await notificationPermission(true);
  setNativePermission(perm);
  scheduleReminders();

  // The cat game: once found, he says hello in a notification once a day
  await initPet();
  if (perm === 'granted') await sayHelloOncePerDay(getPet(), notificationText);

  // Exact alarms (on-the-minute reminders) — Android 14 turns these off by default
  if (perm === 'granted' && !(await exactAlarmsAllowed()) && !(await getSetting('exactAlarmAsked'))) {
    await setSetting('exactAlarmAsked', true);
    showToast({
      title:   'Reminders may be a few minutes late',
      message: 'Allow "Alarms & reminders" for DYDTT so they arrive on time.',
      actions: [{ label: 'Allow', primary: true, onClick: () => openExactAlarmSettings() }, { label: 'Later' }],
    });
  }

  // Notification tapped, or its "Done" button pressed
  LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
    if (notification.extra?.pet) { await openSecretPage(); return; }
    const { taskId, date } = notification.extra ?? {};
    if (!taskId) return;
    if (actionId === 'done') {
      await store.dispatch('TASK_UPSERT', { id: taskId, done: true });
      showToast({ message: 'Marked done', variant: 'success', timeout: 2500 });
    } else {
      if (store.state.viewing) await closeShared();
      await openTask({ id: taskId, date });
    }
  });

  // Android back button
  App.addListener('backButton', async () => {
    if (isSecretOpen()) { secretBack(); return; }
    const dialog = document.querySelector('.dialog-overlay');
    if (dialog) {
      (dialog.querySelector('.dialog__cancel, #pe-cancel'))?.click();
      return;
    }
    if (store.state.ui.modalOpen) { await store.dispatch('MODAL_CLOSE'); return; }
    if (store.state.viewing)      { await closeShared(); return; }
    App.minimizeApp();
  });

  // Back in front: new day? refresh; re-sync reminders + permission
  let lastDay = todayStr();
  App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return;
    const nowPerm = await notificationPermission(false);
    setNativePermission(nowPerm);
    if (todayStr() !== lastDay) {
      const wasToday = store.state.currentDate === lastDay;
      lastDay = todayStr();
      if (wasToday) await store.dispatch('NAV_TO_DATE', { date: lastDay });
    }
    scheduleReminders();
    await refreshPet();
    if (nowPerm === 'granted') await sayHelloOncePerDay(getPet(), notificationText);
  });
}
