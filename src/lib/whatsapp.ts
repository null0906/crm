export function getWhatsAppHref(phone: string | null | undefined, defaultCountryCode = '91') {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;

  const normalized = digits.length === 10 ? `${defaultCountryCode}${digits}` : digits.replace(/^0+/, '');
  return normalized ? `https://wa.me/${normalized}` : null;
}
