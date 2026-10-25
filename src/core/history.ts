import type { Project } from './model';
type Settings=Pick<Project,'interactions'|'layouts'>;
export class History {
  private past: Settings[]=[];
  private future: Settings[]=[];
  get canUndo() { return this.past.length>0; }
  get canRedo() { return this.future.length>0; }
  push(project: Project) { this.past.push(structuredClone({interactions:project.interactions,layouts:project.layouts})); if(this.past.length>50)this.past.shift();this.future=[]; }
  undo(project: Project) { const previous=this.past.pop();if(previous){this.future.push(structuredClone({interactions:project.interactions,layouts:project.layouts}));Object.assign(project,previous);} }
  redo(project: Project) { const next=this.future.pop();if(next){this.past.push(structuredClone({interactions:project.interactions,layouts:project.layouts}));Object.assign(project,next);} }
  clear() {this.past=[];this.future=[];}
}
