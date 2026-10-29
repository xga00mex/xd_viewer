import type { Project } from './model';
type Settings = Pick<Project, 'interactions' | 'layouts'> & {
  artboards: Project['document']['artboards'];
};
const snapshot = (project: Project): Settings => ({
  ...structuredClone({ interactions: project.interactions, layouts: project.layouts }),
  artboards: project.document.artboards,
});
function restore(project: Project, state: Settings) {
  project.interactions = state.interactions;
  project.layouts = state.layouts;
  if (project.document.artboards !== state.artboards)
    project.document = { ...project.document, artboards: state.artboards };
}
export class History {
  private past: Settings[] = [];
  private future: Settings[] = [];
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  push(project: Project) {
    this.past.push(snapshot(project));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  undo(project: Project) {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(snapshot(project));
      restore(project, previous);
    }
  }
  redo(project: Project) {
    const next = this.future.pop();
    if (next) {
      this.past.push(snapshot(project));
      restore(project, next);
    }
  }
  clear() {
    this.past = [];
    this.future = [];
  }
}
