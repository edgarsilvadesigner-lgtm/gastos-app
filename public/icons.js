// Minimal outline icon set (24x24, stroke-based). Keyed by category id.
const ICONS = {
  saude: '<path d="M12 20s-7-4.35-9.5-8.8C.8 7.8 2.3 4.5 5.6 4c2-.3 3.6.8 4.4 2.3.8-1.5 2.4-2.6 4.4-2.3 3.3.5 4.8 3.8 3.1 7.2C19 15.65 12 20 12 20z"/>',
  lazer: '<path d="M12 3l2.2 5.6 6 .5-4.6 3.9 1.5 5.9L12 15.9 6.9 18.9l1.5-5.9-4.6-3.9 6-.5z"/>',
  casa: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  cafe: '<path d="M5 9h11v5a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4V9z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 5.5c0-1 1-1 1-2M11.5 5.5c0-1 1-1 1-2"/>',
  educacao: '<path d="M2 8l10-4 10 4-10 4-10-4z"/><path d="M6 10v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5"/><path d="M22 8v6"/>',
  presentes: '<path d="M3 9h18v4H3z"/><path d="M5 13h14v8H5z"/><path d="M12 9v12"/><path d="M12 9c-1.5 0-4-1-4-3.2C8 4 9.5 3 11 4c1 .6 1 3 1 5zm0 0c1.5 0 4-1 4-3.2C16 4 14.5 3 13 4c-1 .6-1 3-1 5z"/>',
  compras_mercado: '<path d="M4 9h16l-1.5 9.5a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 9z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/>',
  familia: '<circle cx="8" cy="7" r="2.2"/><circle cx="16" cy="7" r="2.2"/><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5"/><path d="M11 19c0-3 2.2-5 5-5s5 2 5 5"/>',
  exercicio: '<path d="M4 12h2M18 12h2M6 12v-2.5a1.5 1.5 0 0 1 3 0V12M6 12v2.5a1.5 1.5 0 0 0 3 0V12M15 12v-2.5a1.5 1.5 0 0 1 3 0V12M15 12v2.5a1.5 1.5 0 0 0 3 0V12M9 12h6"/>',
  transporte: '<path d="M4 16V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8"/><path d="M4 16h16v2H4z"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/><path d="M4 11h16"/>',
  outros: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 2"/><path d="M12 17h.01"/>',
  renda_casa: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9h12v-9"/><path d="M9.5 19v-3.2c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V19"/>',
  gasolina_mota: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8 17h5l3-5h3"/><path d="M9 12h4l2 5"/><path d="M13 8h3l1 2"/>',
  restaurantes: '<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10M16 3c-1.5 0-2.5 2-2.5 4.5S14.5 12 16 12s2.5-1.9 2.5-4.5S17.5 3 16 3zM16 12v9"/>',
  ginasio: '<path d="M6 15c0-3 1.5-6 5-7"/><path d="M11 8a2 2 0 1 1 3.5 1.3c-1 1.2-1.5 2-1.5 3.7v2"/><path d="M9 18h8"/>',
  poupanca: '<path d="M4 13a5 5 0 0 1 5-5h6c2.5 0 4.5 1.6 5 4l1 .5-1 1.5h-1v2h-2v-2H8.5V16h-2v-2A3 3 0 0 1 4 13z"/><circle cx="9" cy="12" r=".6" fill="currentColor" stroke="none"/><path d="M13 8V6.5"/>',
  agua: '<path d="M12 3s6 6.7 6 11a6 6 0 0 1-12 0c0-4.3 6-11 6-11z"/>',
  roupa: '<path d="M9 4 5 6.5 3 10l3 2v9h12v-9l3-2-2-3.5L15 4"/><path d="M9 4a3 3 0 0 0 6 0"/>',
  consumiveis: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 12h6"/>',
  gasoleo_carrinha: '<path d="M4 16V9a2 2 0 0 1 2-2h9l3 4h2v5"/><path d="M4 16h16v1H4z"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
  luz: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/>',
};

const ICON_FALLBACK = '<circle cx="12" cy="12" r="9"/>';

function categoryIconSvg(categoryId) {
  const inner = ICONS[categoryId] || ICON_FALLBACK;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
