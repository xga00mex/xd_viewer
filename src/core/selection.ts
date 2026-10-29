import { emptyStyle, type Bounds, type DesignNode, type Matrix, type Project } from './model';
import { identity, multiply, transformBounds, union } from './geometry';

/** Ignore selected descendants of an already-selected container. */
export function selectionRoots(board: DesignNode, selected: Set<string>): DesignNode[] {
  const visit = (node: DesignNode): DesignNode[] =>
    selected.has(node.id) ? [node] : node.children.flatMap(visit);
  return board.children.flatMap(visit);
}

/** Fully enclosed objects are selected; partial containers are searched recursively. */
export function enclosedNodes(board: DesignNode, area: Bounds): string[] {
  const result: string[] = [];
  const visit = (node: DesignNode, parent: Matrix) => {
    if (!node.visible) return;
    const matrix = multiply(parent, node.transform),
      b = transformBounds(node.bounds, matrix);
    if (
      b.x >= area.x &&
      b.y >= area.y &&
      b.x + b.width <= area.x + area.width &&
      b.y + b.height <= area.y + area.height
    ) {
      result.push(node.id);
    } else node.children.forEach((child) => visit(child, matrix));
  };
  board.children.forEach((node) => visit(node, board.transform));
  return result;
}

/** Immutable edits let undo retain scene references without copying image data. */
export function groupSelection(project: Project, boardId: string, selected: Set<string>): string {
  const board = project.document.artboards.find((node) => node.id === boardId)!;
  const roots = selectionRoots(board, selected);
  if (selected.has(boardId) || roots.length < 2)
    throw new Error('請選取至少兩個圖層來組合（不含畫板）。');
  const ids = new Set(roots.map((node) => node.id));
  const paths: DesignNode[][] = [];
  const walk = (node: DesignNode, path: DesignNode[]) => {
    if (ids.has(node.id)) paths.push(path);
    else node.children.forEach((child) => walk(child, [...path, node]));
  };
  walk(board, []);
  const common = paths[0].filter((node, i) => paths.every((path) => path[i] === node)).at(-1)!;
  const groupId = 'xv-group-' + crypto.randomUUID();
  const wrappers = new Map<string, string>();
  const cloneClip = (node: DesignNode): DesignNode => ({
    ...node,
    id: 'xv-clip-' + crypto.randomUUID(),
    children: node.children.map(cloneClip),
    clip: node.clip ? cloneClip(node.clip) : undefined,
  });
  const take = (node: DesignNode): DesignNode | undefined => {
    if (ids.has(node.id)) return node;
    const children = node.children.flatMap((child) => {
      const kept = take(child);
      return kept ? [kept] : [];
    });
    if (!children.length) return;
    if (node.component) throw new Error('請先選取完整元件，再與其他圖層組合。');
    const id = 'xv-container-' + crypto.randomUUID();
    wrappers.set(node.id, id);
    return {
      ...node,
      id,
      children,
      clip: node.clip ? cloneClip(node.clip) : undefined,
      bounds: union(children.map((child) => transformBounds(child.bounds, child.transform))),
    };
  };
  const children = common.children.flatMap((node) => {
    const kept = take(node);
    return kept ? [kept] : [];
  });
  const group: DesignNode = {
    id: groupId,
    sourceId: groupId,
    name: '群組',
    kind: 'group',
    transform: identity(),
    bounds: union(children.map((node) => transformBounds(node.bounds, node.transform))),
    children,
    visible: true,
    style: emptyStyle(),
  };
  const contains = (node: DesignNode): boolean => ids.has(node.id) || node.children.some(contains);
  const last = common.children.reduce((found, node, index) => (contains(node) ? index : found), -1);
  const remove = (node: DesignNode): DesignNode | undefined => {
    if (ids.has(node.id)) return;
    if (!contains(node)) return node;
    const children = node.children.flatMap((child) => {
      const kept = remove(child);
      return kept ? [kept] : [];
    });
    return children.length ? { ...node, children } : undefined;
  };
  const replace = (node: DesignNode): DesignNode =>
    node === common
      ? {
          ...node,
          children: node.children.flatMap((child, index) => {
            const kept = remove(child);
            return [...(kept ? [kept] : []), ...(index === last ? [group] : [])];
          }),
        }
      : { ...node, children: node.children.map(replace) };
  project.document = {
    ...project.document,
    artboards: project.document.artboards.map((node) => (node === board ? replace(node) : node)),
  };
  const remaining = new Set<string>();
  const index = (node: DesignNode) => {
    remaining.add(node.id);
    node.children.forEach(index);
  };
  project.document.artboards.forEach(index);
  project.interactions = { ...project.interactions };
  project.layouts = { ...project.layouts };
  for (const [source, copy] of wrappers) {
    if (project.interactions[source])
      project.interactions[copy] = structuredClone(project.interactions[source]);
    if (project.layouts[source]) project.layouts[copy] = structuredClone(project.layouts[source]);
    if (!remaining.has(source)) {
      delete project.interactions[source];
      delete project.layouts[source];
    }
  }
  for (const [id, interaction] of Object.entries(project.interactions)) {
    const click = interaction.click;
    if (click && !remaining.has(click.target) && wrappers.has(click.target))
      project.interactions[id] = {
        ...interaction,
        click: { ...click, target: wrappers.get(click.target)! },
      };
  }
  return groupId;
}

export function ungroupSelection(
  project: Project,
  boardId: string,
  selected: Set<string>
): string[] {
  const board = project.document.artboards.find((node) => node.id === boardId)!;
  const groups = selectionRoots(board, selected).filter((node) => node.kind === 'group');
  if (!groups.length) throw new Error('請先選取群組。');
  // Flattening a mask or a shared compositing effect would change its appearance.
  if (
    groups.some(
      (node) =>
        node.clip ||
        node.component ||
        node.style.opacity !== 1 ||
        node.style.shadows.length ||
        node.style.blendMode ||
        node.fixed ||
        project.interactions[node.id] ||
        (project.layouts[node.id] && project.layouts[node.id].mode !== 'absolute')
    )
  )
    throw new Error('此群組含遮罩、元件狀態、共用效果或互動；請先移除群組效果後再解散。');
  const ids = new Set(groups.map((node) => node.id));
  const result: string[] = [];
  const visit = (node: DesignNode): DesignNode[] => {
    if (ids.has(node.id))
      return node.children.map((child) => {
        result.push(child.id);
        return {
          ...child,
          visible: node.visible && child.visible,
          transform: multiply(node.transform, child.transform),
        };
      });
    return [{ ...node, children: node.children.flatMap(visit) }];
  };
  project.document = {
    ...project.document,
    artboards: project.document.artboards.map((node) => (node === board ? visit(node)[0] : node)),
  };
  for (const id of ids) {
    delete project.layouts[id];
    delete project.interactions[id];
  }
  return result;
}
