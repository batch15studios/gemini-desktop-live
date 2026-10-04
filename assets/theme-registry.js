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
    id: 'synthwave-violet',
    name: 'Synthwave Violet',
    tag: 'Quantum Pulse',
    primary: '#c084fc',
    secondary: '#f472b6',
    bg: '#0f0a1a',
    desc: 'Retro-futuristic purple & vivid magenta laser'
  },
  {
    id: 'matrix-emerald',
    name: 'Matrix Emerald',
    tag: 'Bio-Digital',
    primary: '#10b981',
    secondary: '#22c55e',
    bg: '#06120c',
    desc: 'Tactical cyberpunk emerald & terminal phosphor'
  },
  {
    id: 'amber-horizon',
    name: 'Amber Horizon',
    tag: 'Solar Flare',
    primary: '#f59e0b',
    secondary: '#f97316',
    bg: '#160e08',
    desc: 'Aerospace telemetry gold & molten solar flare'
  },
  {
    id: 'crimson-protocol',
    name: 'Crimson Protocol',
    tag: 'Stealth Ops',
    primary: '#ef4444',
    secondary: '#f43f5e',
    bg: '#18080a',
    desc: 'Red alert laser & dark tactical stealth carbon'
  },
  {
    id: 'glacial-arctic',
    name: 'Glacial Arctic',
    tag: 'Cryo-Titanium',
    primary: '#38bdf8',
    secondary: '#94a3b8',
    bg: '#0c1420',
    desc: 'Cryogenic diamond ice & brushed titanium slate'
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
  'synthwave-violet': {
    primary: '#c084fc',
    secondary: '#f472b6',
    glow: 'rgba(192, 132, 252, 0.5)',
    aura: 'rgba(192, 132, 252, 0.4)',
    ring: 'rgba(192, 132, 252, 0.5)',
    coreA: '#ffffff',
    coreB: '#c084fc',
    coreC: '#f472b6',
    synthGradient: ['#c084fc', '#f472b6', '#ec4899'],
    synthWave: '#fdf2f8'
  },
  'matrix-emerald': {
    primary: '#10b981',
    secondary: '#22c55e',
    glow: 'rgba(16, 185, 129, 0.5)',
    aura: 'rgba(16, 185, 129, 0.4)',
    ring: 'rgba(16, 185, 129, 0.5)',
    coreA: '#ffffff',
    coreB: '#22c55e',
    coreC: '#10b981',
    synthGradient: ['#10b981', '#22c55e', '#06b6d4'],
    synthWave: '#ecfdf5'
  },
  'amber-horizon': {
    primary: '#f59e0b',
    secondary: '#f97316',
    glow: 'rgba(245, 158, 11, 0.5)',
    aura: 'rgba(245, 158, 11, 0.4)',
    ring: 'rgba(245, 158, 11, 0.5)',
    coreA: '#ffffff',
    coreB: '#f97316',
    coreC: '#f59e0b',
    synthGradient: ['#f59e0b', '#f97316', '#ef4444'],
    synthWave: '#fffbeb'
  },
  'crimson-protocol': {
    primary: '#ef4444',
    secondary: '#f43f5e',
    glow: 'rgba(239, 68, 68, 0.5)',
    aura: 'rgba(239, 68, 68, 0.4)',
    ring: 'rgba(239, 68, 68, 0.5)',
    coreA: '#ffffff',
    coreB: '#f43f5e',
    coreC: '#ef4444',
    synthGradient: ['#ef4444', '#f43f5e', '#fb923c'],
    synthWave: '#fff1f2'
  },
  'glacial-arctic': {
    primary: '#38bdf8',
    secondary: '#94a3b8',
    glow: 'rgba(56, 189, 248, 0.5)',
    aura: 'rgba(56, 189, 248, 0.4)',
    ring: 'rgba(56, 189, 248, 0.5)',
    coreA: '#ffffff',
    coreB: '#38bdf8',
    coreC: '#94a3b8',
    synthGradient: ['#38bdf8', '#94a3b8', '#e2e8f0'],
    synthWave: '#f0f9ff'
  }
};

function getThemePalette(themeId) {
  return THEME_PALETTES[themeId] || THEME_PALETTES['cyber-cyan'];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEMES, THEME_PALETTES, getThemePalette };
}
