import { strToU8, zipSync } from 'fflate';

// Original tiny images and AGC data; no private design assets are included.
const red =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4z8DwHxkzkC4AADxAH+HdRw9wAAAAAElFTkSuQmCC';
const blue =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNgYPj/HxWTLAAAHGAf4ah9/4IAAAAASUVORK5CYII=';

export function multiBoardXd() {
  const entries: Record<string, Uint8Array> = {};
  const boards = [
    { id: 'first', x: 0, y: 0, pattern: { meta: { ux: { uid: 'red' } } } },
    {
      id: 'second',
      x: 2400,
      y: -900,
      pattern: { meta: { ux: { uid: 'stale-uid' } }, href: 'C:\\design\\blue.png' },
    },
    { id: 'third', x: -1200, y: 3200, pattern: { href: '../resources/a/shared.png' } },
    { id: 'fourth', x: 8000, y: 7000, pattern: { meta: { ux: { uid: 'blue-by-manifest' } } } },
  ];
  for (const board of boards) {
    entries[`artwork/artboard-${board.id}/graphics/graphicContent.agc`] = strToU8(
      JSON.stringify({
        children: [
          {
            type: 'artboard',
            id: board.id,
            artboard: {
              ref: board.id,
              children: [
                board.id === 'fourth'
                  ? {
                      type: 'syncRef',
                      guid: `${board.id}-image`,
                      syncSourceGuid: 'source-image',
                      transform: { tx: board.x + 8, ty: board.y + 8 },
                    }
                  : {
                      type: 'shape',
                      id: `${board.id}-image`,
                      name: '同名圖片',
                      transform: { tx: board.x + 8, ty: board.y + 8 },
                      shape: { type: 'rect', x: 0, y: 0, width: 16, height: 16 },
                      style: { fill: { type: 'pattern', pattern: board.pattern } },
                    },
              ],
            },
          },
        ],
      })
    );
  }
  entries.manifest = strToU8(
    JSON.stringify({
      children: [
        {
          path: 'artwork',
          children: boards.map((b) => ({
            path: `artboard-${b.id}`,
            name: b.id,
            'uxdesign#bounds': { x: b.x, y: b.y, width: 64, height: 64 },
            'uxdesign#viewport': { height: 48 },
          })),
        },
        {
          path: 'resources',
          components: [{ id: 'blue-by-manifest', path: 'images/blue.png', type: 'image/png' }],
        },
      ],
    })
  );
  // Dimensions from AGC and coordinates from manifest must be merged per field.
  entries['resources/graphics/graphicContent.agc'] = strToU8(
    JSON.stringify({
      artboards: Object.fromEntries(boards.map((b) => [b.id, { width: 64, height: 64 }])),
      resources: {
        symbols: [
          {
            type: 'shape',
            id: 'source-image',
            name: 'shared image',
            shape: { type: 'rect', x: 0, y: 0, width: 16, height: 16 },
            style: { fill: { type: 'pattern', pattern: boards[3].pattern } },
          },
        ],
      },
    })
  );
  entries['resources/images/red.png'] = Uint8Array.from(atob(red), (c) => c.charCodeAt(0));
  entries['resources/images/blue.png'] = Uint8Array.from(atob(blue), (c) => c.charCodeAt(0));
  entries['resources/a/shared.png'] = entries['resources/images/red.png'];
  entries['resources/b/shared.png'] = entries['resources/images/blue.png'];
  return zipSync(entries);
}
