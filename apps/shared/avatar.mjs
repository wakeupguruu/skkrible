export const FACE_COLORS = ['#f6c65b', '#ff937d', '#a8d77b', '#78cbe8', '#b49bea', '#ef9ec3', '#dfb08b', '#e0e7ed'];
export const FACE_PARTS = { color: 8, eyes: 5, mouth: 5, accessory: 4 };
export const validAvatar = id => Number.isInteger(id) && id >= 0 && id < 800;
export function decodeAvatar(id) {
  let value = validAvatar(id) ? id : 0;
  const parts = {};
  for (const [key, count] of Object.entries(FACE_PARTS)) { parts[key] = value % count; value = Math.floor(value / count); }
  return parts;
}
export function encodeAvatar(parts) {
  let id = 0, multiplier = 1;
  for (const [key, count] of Object.entries(FACE_PARTS)) {
    const part = parts[key];
    if (!Number.isInteger(part) || part < 0 || part >= count) throw new Error('Invalid avatar part.');
    id += part * multiplier; multiplier *= count;
  }
  return id;
}
