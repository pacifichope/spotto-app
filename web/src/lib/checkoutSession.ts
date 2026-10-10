const qtyKey = (eventId: string) =>
  `spotto.checkout.qty.${eventId.trim().toLowerCase()}`;

export function saveCheckoutQuantity(eventId: string, quantity: number) {
  if (typeof window === 'undefined') return;
  const qty = Math.max(1, Math.floor(quantity || 1));
  try {
    window.sessionStorage.setItem(qtyKey(eventId), String(qty));
  } catch {
    /* ignore */
  }
}

export function loadCheckoutQuantity(eventId: string, fallback = 1) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(qtyKey(eventId));
    const n = Math.floor(Number(raw) || 0);
    return n >= 1 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function clearCheckoutQuantity(eventId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(qtyKey(eventId));
  } catch {
    /* ignore */
  }
}
