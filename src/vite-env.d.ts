/// <reference types="vite/client" />

declare global {
  interface Window {
    THREE: any;
    OV: any;
    [key: string]: any;
  }
}

export {};
