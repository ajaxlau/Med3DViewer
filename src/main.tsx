import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("3DViewerPlus PWA starting...");

createRoot(document.getElementById('root')!).render(
  <App />
);
