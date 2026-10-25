import './style.css';
import { Studio } from './ui/app';

const studio = new Studio(document.querySelector<HTMLElement>('#app')!);
void studio.restore();
if (import.meta.hot) import.meta.hot.dispose(() => studio.destroy());
