import type { Bounds, DesignNode, Matrix } from './model';

export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
export const round = (n: number) => Math.round(n * 1000) / 1000;
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformBounds(b: Bounds, m: Matrix): Bounds {
  const pts = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y]) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  const x = Math.min(...pts.map(p=>p[0])), y = Math.min(...pts.map(p=>p[1]));
  return { x, y, width: Math.max(...pts.map(p=>p[0]))-x, height: Math.max(...pts.map(p=>p[1]))-y };
}
export function union(bounds: Bounds[]): Bounds {
  if (!bounds.length) return {x:0,y:0,width:0,height:0};
  const x = Math.min(...bounds.map(b=>b.x)), y = Math.min(...bounds.map(b=>b.y));
  return {x,y,width:Math.max(...bounds.map(b=>b.x+b.width))-x,height:Math.max(...bounds.map(b=>b.y+b.height))-y};
}
export function worldBounds(root: DesignNode, id: string): Bounds | undefined {
  function visit(node: DesignNode, parent: Matrix): Bounds | undefined {
    const m = multiply(parent, node.transform);
    if (node.id === id) return transformBounds(node.bounds,m);
    for (const child of node.children) { const found = visit(child,m); if(found) return found; }
  }
  return visit(root,identity());
}
export function measure(a: Bounds, b: Bounds) {
  return { horizontal: Math.max(0, b.x-a.x-a.width, a.x-b.x-b.width), vertical: Math.max(0,b.y-a.y-a.height,a.y-b.y-b.height), deltaX: b.x-a.x, deltaY:b.y-a.y };
}
