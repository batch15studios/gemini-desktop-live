/**
 * Shared Theme Registry for Gemini Multimodal Assistant
 * Central source of truth for color tokens, canvas render palettes, and theme definitions.
 */

const THEMES = [
  {
    id: 'cyber-cyan',
    name: 'Cyber Cyan',
    tag: 'Nexus Prime',
    primary: '#00f0ff',
    secondary: '#70a1ff',
    bg: '#09101c',
    desc: 'Holographic cyan neon & deep obsidian glass'
  },
  {
    id: 'enterprise-pro',
    name: 'Enterprise Slate',
    tag: 'Windows Studio',
    primary: '#0078d4',
    secondary: '#38bdf8',
    bg: '#0b111e',
    desc: 'Native Windows 11 Fluent Studio & brushed titanium slate'
  },
  {
    id: 'custom',
    name: 'Custom Palette',
    tag: 'Studio Engine',
    primary: '#a855f7',
    secondary: '#ec4899',
    bg: '#0c0e14',
    desc: 'Interactive custom accent palette & dynamic harmonic glows'
  }
];

const THEME_PALETTES = {
  'cyber-cyan': {
    primary: '#00f0ff',
    secondary: '#70a1ff',
    glow: 'rgba(0, 240, 255, 0.45)',
    aura: 'rgba(0, 220, 255, 0.4)',
    ring: 'rgba(0, 240, 255, 0.45)',
    coreA: '#ffffff',
    coreB: '#70a1ff',
    coreC: '#00d2d3',
    synthGradient: ['#00f0ff', '#70a1ff', '#00d2d3'],
    synthWave: '#ffffff'
  },
  'enterprise-pro': {
    primary: '#0078d4',
    secondary: '#38bdf8',
    glow: 'rgba(0, 120, 212, 0.35)',
    aura: 'rgba(56, 189, 248, 0.22)',
    ring: 'rgba(0, 120, 212, 0.45)',
    coreA: '#ffffff',
    coreB: '#38bdf8',
    coreC: '#0078d4',
    synthGradient: ['#0078d4', '#38bdf8', '#94a3b8'],
    synthWave: '#f8fafc'
  },
  'pro-studio': {
    primary: '#0078d4',
    secondary: '#38bdf8',
    glow: 'rgba(0, 120, 212, 0.35)',
    aura: 'rgba(56, 189, 248, 0.22)',
    ring: 'rgba(0, 120, 212, 0.45)',
    coreA: '#ffffff',
    coreB: '#38bdf8',
    coreC: '#0078d4',
    synthGradient: ['#0078d4', '#38bdf8', '#94a3b8'],
    synthWave: '#f8fafc'
  }
};

const SKINS = [
  {
    id: 'default',
    name: 'Nexus Hologram',
    tag: 'Cyber Glass',
    desc: 'Sleek frosted glass panels & celestial energy orb'
  },
  {
    id: 'pro-studio',
    name: 'Studio Pro Lens',
    tag: 'Native Pro Tool',
    desc: 'Precision optical telemetry aperture, degree ticks & native studio UI'
  },
  {
    id: 'cog-gear',
    name: 'Industrial Cog Gear',
    tag: 'Mechanical Orb',
    desc: 'Precision mechanical rotating cog gear and tactical telemetry reticle'
  }
];

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 168, g: 85, b: 247 };
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  if (isNaN(bigint)) return { r: 168, g: 85, b: 247 };
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function computeCustomPalette(hexColor) {
  const hex = hexColor || '#a855f7';
  const rgb = hexToRgb(hex);
  return {
    primary: hex,
    secondary: hex,
    glow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`,
    aura: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
    ring: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`,
    coreA: '#ffffff',
    coreB: hex,
    coreC: hex,
    synthGradient: [hex, '#ffffff', hex],
    synthWave: '#ffffff'
  };
}

function getThemePalette(themeId, customColor = null) {
  if (themeId === 'custom' || customColor) {
    return computeCustomPalette(customColor);
  }
  return THEME_PALETTES[themeId] || THEME_PALETTES['cyber-cyan'];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEMES, SKINS, THEME_PALETTES, getThemePalette, computeCustomPalette, hexToRgb };
}
