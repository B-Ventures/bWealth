import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Messaging setup
let messaging: any = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.log("Firebase messaging not supported or configured in this environment.");
}

export const requestNotificationPermission = async () => {
  if (!messaging) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      // In a real app we'd need a VAPID key here, but we can attempt basic getToken
      // usually requires: getToken(messaging, { vapidKey: 'YOUR_PUBLIC_VAPID_KEY_HERE' })
      const currentToken = await getToken(messaging);
      if (currentToken) {
        console.log('Push token:', currentToken);
        // Save token to firestore if needed
      } else {
        console.log('No registration token available. Request permission to generate one.');
      }
    } else {
      console.log('Unable to get permission to notify.');
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
  }
};

export const setupOnMessage = (callback: (payload: any) => void) => {
  if (!messaging) return;
  return onMessage(messaging, callback);
};
