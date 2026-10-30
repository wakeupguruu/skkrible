import { FACE_COLORS, decodeAvatar } from '../../shared/avatar.mjs';

// SVG attributes come from local bounded choices; names and network text never enter markup.
export function avatarMarkup(id) {
  const { color, eyes, mouth, accessory } = decodeAvatar(id);
  const eyeShapes = [
    '<ellipse cx="35" cy="46" rx="4" ry="7"/><ellipse cx="65" cy="46" rx="4" ry="7"/>',
    '<path d="m29 48 7-6 7 6m14 0 7-6 7 6" fill="none" stroke-width="4"/>',
    '<path d="M28 41h16v13H28zm28 0h16v13H56z" fill="#fff"/><path d="M32 45h6v7h-6zm29 0h6v7h-6z"/><path d="M44 46h12"/>',
    '<path d="M29 45h14m15 0h13" stroke-width="5"/><circle cx="35" cy="49" r="3"/><circle cx="65" cy="49" r="3"/>',
    '<ellipse cx="35" cy="46" rx="5" ry="8" fill="#fff"/><ellipse cx="65" cy="46" rx="5" ry="8" fill="#fff"/><circle cx="36" cy="48" r="3"/><circle cx="64" cy="48" r="3"/>'
  ];
  const mouths = ['<path d="M34 62q16 20 32 0" fill="#fff"/>', '<path d="M37 66q13 9 26-2" fill="none"/>', '<ellipse cx="50" cy="68" rx="7" ry="9"/>', '<path d="M36 65h28v9H36z" fill="#fff"/>', '<path d="m35 66 7 4 8-4 8 4 7-4" fill="none"/>'];
  const extras = ['', '<path d="m23 29 4-20 16 10 14-12 17 20" fill="#f57572"/><path d="M22 29h54" stroke-width="5"/>', '<path d="M24 30q-4-25 26-25t26 25" fill="#4d78cf"/><path d="M21 29h65" stroke-width="6"/>', '<path d="M33 25V8h34v17M24 26h52" fill="#544269" stroke-width="5"/>'];
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g stroke="#25364b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 90q1-18 29-18t29 18" fill="${FACE_COLORS[color]}"/><path d="M20 40q-2-25 30-25t30 25v19q0 27-30 27T20 59Z" fill="${FACE_COLORS[color]}"/><g fill="#25364b">${eyeShapes[eyes]}${mouths[mouth]}</g><path d="m49 51-3 8h7" fill="none" opacity=".35"/>${extras[accessory]}</g></svg>`;
}
