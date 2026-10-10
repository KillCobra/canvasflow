import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';

// Local "time to post" reminders for planned posts. Nothing leaves the phone:
// they're scheduled with the system and open the grid planner when tapped.
//
// expo-notifications is loaded only when this build includes it, so an older
// development build keeps working (just without reminders).

type NotificationsModule = typeof import('expo-notifications');

let module: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (module === undefined) {
    module = null;
    if (requireOptionalNativeModule('ExpoNotificationScheduler') && requireOptionalNativeModule('ExpoPushTokenManager')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        module = require('expo-notifications') as NotificationsModule;
      } catch {
        module = null;
      }
    }
  }
  return module;
}

export const remindersAvailable = () => notifications() != null;

let routed = false;

/** Shows reminders while Seam is open too, and opens their screen when one is tapped. Call once. */
export function setupReminders() {
  const Notifications = notifications();
  if (routed || !Notifications) return;
  routed = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  const open = (response: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  };
  Notifications.addNotificationResponseReceivedListener(open);
  // A reminder tapped while Seam wasn't running.
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) {
        open(r);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    })
    .catch(() => {});
}

/** Asks for permission if it hasn't been decided yet. True when reminders can be shown. */
export async function canRemind(): Promise<boolean> {
  const Notifications = notifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return asked.granted;
}

/** Schedules a reminder at `at` (ms). Returns its id, or null if it's in the past or not allowed. */
export async function scheduleReminder({ title, body, at, url }: { title: string; body: string; at: number; url: string }) {
  const Notifications = notifications();
  if (!Notifications || at <= Date.now() + 5_000) return null;
  if (!(await canRemind())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url }, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

export async function cancelReminder(id: string | undefined) {
  const Notifications = notifications();
  if (!id || !Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
