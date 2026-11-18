export function validEmailAddress(value: string): boolean {
  return value.length <= 254 && /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(value);
}
