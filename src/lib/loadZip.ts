import type JSZip from 'jszip';

let pendingZip: Promise<typeof JSZip> | undefined;

// ZIP parsing/export is optional at startup. Share one chunk load across every
// archive entry point; allow retry if the network or a stale deployment chunk
// makes the dynamic import fail.
export function loadZip(): Promise<typeof JSZip> {
  if (!pendingZip) {
    pendingZip = import('jszip').then(module => module.default).catch(error => {
      pendingZip = undefined;
      throw error;
    });
  }
  return pendingZip;
}
