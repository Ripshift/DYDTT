/**
 * DYDTT — The cat's daily hello (Android app).
 * Once his secret page has been found, the first time the app is opened each
 * day he sends one notification about how he's doing. Never before he's found.
 * He has his own channel, so it can be muted separately in Android settings.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { getSetting, setSetting } from '../db/schema.js';
import { todayStr } from '../utils/dateHelpers.js';

export const PET_CHANNEL_ID = 'cat';
export const PET_NOTIFICATION_ID = 2_000_000_001;
export const HELLO_DAY_KEY = 'petHelloDay';

export async function setupPetChannel() {
  await LocalNotifications.createChannel({
    id:          PET_CHANNEL_ID,
    name:        'Your cat',
    description: 'A daily hello from your cat',
    importance:  3,
    visibility:  1,
  });
}

/** Send today's hello if he's been found and hasn't said hi yet today. */
export async function sayHelloOncePerDay(pet, textFor) {
  if (!pet?.found) return false;
  const today = todayStr();
  if ((await getSetting(HELLO_DAY_KEY)) === today) return false;
  await setSetting(HELLO_DAY_KEY, today);
  await LocalNotifications.schedule({
    notifications: [{
      id:         PET_NOTIFICATION_ID,
      title:      'Your cat',
      body:       textFor(pet),
      channelId:  PET_CHANNEL_ID,
      smallIcon:  'ic_stat_dydtt',
      iconColor:  '#E8862A',
      autoCancel: true,
      extra:      { pet: true },
    }],
  });
  return true;
}
