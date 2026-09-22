import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("Med3DViewer PWA starting...");

createRoot(document.getElementById('root')!).render(
  <App />
);
