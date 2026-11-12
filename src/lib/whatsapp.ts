// Explicit international numbers only: never guess the customer's country.
export function whatsappNumber(phone: string): string | null {
  const trimmed = phone.trim();
  if (!/^(\+|00)[\d ()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[ ()-]/g, "").replace(/^(\+|00)/, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
export function whatsappUrl(phone: string, message: string): string | null {
  const number = whatsappNumber(phone);
  if (!number || !message.trim()) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
