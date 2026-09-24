export const pad2 = (n: number) => n.toString().padStart(2, '0');

/** A mailbox/register word: three digits when non-negative (000-999), plain text otherwise. */
export const word = (n: number) => (n >= 0 ? n.toString().padStart(3, '0') : n.toString());
