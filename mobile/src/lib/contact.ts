import { Linking, Platform } from 'react-native';

/** Digits and a leading + only: "(555) 123-4567" -> "5551234567". */
export function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

// Both open the owner's own phone or text app with the number filled in; nothing goes
// through KILN. Where there's no app for it (a computer browser), nothing happens.
export function callNumber(phone: string): void {
  Linking.openURL(`tel:${dialable(phone)}`).catch(() => {});
}

export function textNumber(phone: string): void {
  Linking.openURL(`sms:${dialable(phone)}`).catch(() => {});
}

/** The texting app with the message typed in; the owner taps send. iPhone and Android spell it differently. */
export function textMessage(phone: string, body: string): Promise<void> {
  const join = Platform.OS === 'ios' ? '&' : '?';
  return Linking.openURL(`sms:${dialable(phone)}${join}body=${encodeURIComponent(body)}`);
}

/** The email app with the subject and message typed in; the owner adds the address and taps send. */
export function emailMessage(subject: string, body: string): Promise<void> {
  return Linking.openURL(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}
