export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  // RFC 4122 v4 without crypto.randomUUID — safe in all Hermes environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
