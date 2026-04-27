import type { StyleSpecification } from 'maplibre-gl'

// Light: OpenFreeMap Positron — vector tiles, free, no API key, no signup.
export const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron'

// Dark: CartoDB dark_all raster tiles — free with attribution, no key.
// Raster on globe projection looks slightly softer than vector but is fine for MVP;
// swap to a vector dark style later if desired.
export const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
    },
  ],
}

export type Theme = 'dark' | 'light'

export function styleFor(theme: Theme): string | StyleSpecification {
  return theme === 'dark' ? DARK_STYLE : LIGHT_STYLE
}
