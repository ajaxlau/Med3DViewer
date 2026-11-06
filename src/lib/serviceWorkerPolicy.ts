// API navigations must reach the Worker. The offline app shell is only for
// application pages; Workbox matches pathname plus query string here.
export const navigationFallbackDenylist = [/^\/api(?:\/|\?|$)/];
