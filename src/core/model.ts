export type Matrix = [number, number, number, number, number, number];
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Stop {
  offset: number;
  color: string;
}
export type Paint =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'linear' | 'radial'; stops: Stop[]; x1: number; y1: number; x2: number; y2: number }
  | {
      type: 'image';
      assetId: string;
      fit: 'cover' | 'contain' | 'stretch';
      transform?: Matrix;
      width?: number;
      height?: number;
    };
export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
}
export interface NodeStyle {
  fill: Paint;
  opacity: number;
  stroke?: {
    color: string;
    width: number;
    align: 'inside' | 'center' | 'outside';
    dash?: number[];
  };
  shadows: Shadow[];
  blendMode?: string;
}
export interface TextRun {
  from: number;
  to: number;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  spacing: number;
  color: string;
}
export interface TextLine {
  from: number;
  to: number;
  x: number;
  y: number;
}
export interface TextData {
  value: string;
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  spacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  lines: TextLine[];
  runs: TextRun[];
  estimatedBounds: boolean;
}
export type NodeKind =
  'artboard' | 'group' | 'rect' | 'ellipse' | 'path' | 'line' | 'text' | 'unsupported';
export interface DesignNode {
  id: string;
  sourceId: string;
  name: string;
  kind: NodeKind;
  bounds: Bounds;
  transform: Matrix;
  style: NodeStyle;
  visible: boolean;
  children: DesignNode[];
  radius?: [number, number, number, number];
  path?: string;
  text?: TextData;
  clip?: DesignNode;
  viewportHeight?: number;
}
export interface Asset {
  id: string;
  name: string;
  mime: string;
  data: string;
}
export interface Diagnostic {
  code: string;
  message: string;
  nodeId?: string;
}
export interface DesignDocument {
  version: 1;
  name: string;
  artboards: DesignNode[];
  assets: Record<string, Asset>;
  diagnostics: Diagnostic[];
  source: 'xd' | 'demo';
}
export interface Interaction {
  click?: { action: 'toggle' | 'scroll' | 'navigate'; target: string };
  hover?: { effect: 'lift' | 'scale' | 'fade'; duration: number };
  scroll?: { effect: 'reveal'; threshold: number; duration: number };
  position?: { mode: 'sticky' | 'fixed'; top: number };
  animation?: { effect: 'fade' | 'slide' | 'pulse'; duration: number; repeat: boolean };
}
export interface Layout {
  mode: 'absolute' | 'row' | 'column' | 'grid';
  responsive: 'fixed' | 'scale' | 'stretch' | 'right' | 'center';
  gap: number;
  padding: number;
  columns: number;
  mobileStack: boolean;
  tag:
    | 'div'
    | 'section'
    | 'header'
    | 'footer'
    | 'nav'
    | 'main'
    | 'article'
    | 'button'
    | 'h1'
    | 'h2'
    | 'p';
}
export interface Project {
  format: 'xd-local-project';
  version: 1;
  document: DesignDocument;
  interactions: Record<string, Interaction>;
  layouts: Record<string, Layout>;
}
export const defaultLayout = (): Layout => ({
  mode: 'absolute',
  responsive: 'fixed',
  gap: 24,
  padding: 0,
  columns: 3,
  mobileStack: true,
  tag: 'div',
});
export const createProject = (document: DesignDocument): Project => ({
  format: 'xd-local-project',
  version: 1,
  document,
  interactions: {},
  layouts: {},
});
export const emptyStyle = (): NodeStyle => ({ fill: { type: 'none' }, opacity: 1, shadows: [] });
export function flatten(nodes: DesignNode[]): DesignNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
export function findNode(project: Project, id: string): DesignNode | undefined {
  return flatten(project.document.artboards).find((n) => n.id === id);
}
