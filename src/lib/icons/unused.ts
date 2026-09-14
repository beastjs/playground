// Icons with no quoted-name reference anywhere in src/ or convex/ when they were
// moved out of icons.ts. Nothing imports this file, so none of it ships.
// To restore one, move its entry back into `icons` in icons.ts.
export const unusedIcons = {
  eraser: {
    symbol:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41L11.5 20m6.5-6.7L11.7 7"/>',
    viewBox: '0 0 24 24',
    set: 'tabler'
  },
  undo: {
    symbol:
      '<path fill="currentColor" d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8"/>',
    viewBox: '0 0 24 24',
    set: 'mdi'
  },
  'home-back': {
    symbol:
      '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/><path d="M19 12h2l-9-9l-9 9h2v7a2 2 0 0 0 2 2h5.5m3.5-2h6m-3-3l3 3l-3 3"/></g>',
    viewBox: '0 0 24 24',
    set: 'tabler'
  },
  'chevron-down-tiny': {
    symbol:
      '<path d="M11.371 12.38c-.757.827-1.985.827-2.742 0l-3.36-3.668a1.07 1.07 0 0 1 0-1.418.864.864 0 0 1 1.299 0l3.36 3.668c.04.044.104.044.144 0l3.36-3.668a.864.864 0 0 1 1.299 0 1.07 1.07 0 0 1 0 1.418z" transform-origin="0 0" fill="currentColor"/>',
    viewBox: '0 0 20 20',
    set: 'svg'
  },
  'arrow-right-up': {
    symbol:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 6.343L6.343 17.657M18 14V6h-8"/>',
    viewBox: '0 0 24 24',
    set: 'mingcute'
  },
  mechanics: {
    symbol:
      '<path d="M10.005 14.004a.75.75 0 0 1 .75.75v1.699l.982-.552a.75.75 0 0 1 .966.201l.056.085a.75.75 0 0 1-.286 1.021l-1.691.951a1.59 1.59 0 0 1-1.553 0l-1.691-.951a.75.75 0 1 1 .735-1.307l.982.552v-1.699a.75.75 0 0 1 .648-.743zm6.875-3.294a.75.75 0 0 1 .75.75v1.922c0 .572-.309 1.1-.807 1.38l-1.808 1.017a.75.75 0 1 1-.735-1.307l1.086-.611-1.442-.833a.75.75 0 0 1-.319-.933l.045-.092a.75.75 0 0 1 1.025-.275l1.457.842v-1.11a.75.75 0 0 1 .648-.743l.102-.007zm-13.75 0a.75.75 0 0 1 .75.75v1.11l1.457-.842a.75.75 0 0 1 .968.19l.057.085a.75.75 0 0 1-.275 1.025l-1.443.833 1.087.611a.75.75 0 0 1 .33.929l-.044.092a.75.75 0 0 1-1.021.286l-1.808-1.017a1.58 1.58 0 0 1-.807-1.38V11.46a.75.75 0 0 1 .75-.75zm10.863-6.199a.75.75 0 0 1 1.021-.286l1.808 1.017c.499.28.807.808.807 1.38v1.921a.75.75 0 1 1-1.5 0V7.432l-1.423.823a.75.75 0 0 1-.968-.19l-.057-.085a.75.75 0 0 1 .275-1.025l1.409-.814-1.086-.61a.75.75 0 0 1-.33-.929zm-8.998-.286a.75.75 0 1 1 .735 1.307l-1.087.61 1.409.814a.75.75 0 0 1 .319.933l-.045.092a.75.75 0 0 1-1.025.275L3.88 7.433v1.11a.75.75 0 0 1-.648.743l-.102.007a.75.75 0 0 1-.75-.75V6.622c0-.572.309-1.1.807-1.38zm4.233-2.381a1.59 1.59 0 0 1 1.553 0l1.691.951a.75.75 0 0 1-.735 1.307l-.982-.553V5.21a.75.75 0 0 1-.648.743l-.102.007a.75.75 0 0 1-.75-.75V3.549l-.982.553a.75.75 0 0 1-.966-.201l-.056-.085a.75.75 0 0 1 .286-1.021z" transform-origin="0 0" fill="currentColor"/>',
    viewBox: '0 0 20 20',
    set: 'svg'
  },
  forms: {
    symbol:
      '<g transform="scale(0.417)"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="3"><path d="M4 10a2 2 0 0 1 2-2h36a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path stroke-linecap="square" d="M4 16h40"/><path stroke-linecap="round" d="M27 32h9m8-22v16M4 10v16"/></g></g>',
    viewBox: '0 0 20 20',
    set: 'svg'
  },
  'pen-bold': {
    symbol:
      '<path fill="currentColor" fill-rule="evenodd" d="M47.724 72.117a3.996 3.996 0 0 1-3.996 3.995h-8a4.004 4.004 0 0 1-4.004-4.004v-47.75a29.2 29.2 0 0 1 6.4-18.245l.8-1a1.024 1.024 0 0 1 1.6 0l.8 1a29.2 29.2 0 0 1 6.4 18.245zm3.007-15.005h-3v6h4a5 5 0 0 0 5-5v-22a3 3 0 0 0-6 0zm-3.008 0H31.73v6h15.992z" clip-rule="evenodd"/>',
    viewBox: '0 0 80 80',
    set: 'glyphs'
  },
  logs: {
    symbol:
      '<path fill="currentColor" fill-rule="evenodd" d="M9 2h6v1.5H9zm0 10h6v1.5H9zm.75-5H9v1.5h6V7zM1 12h2v1.5H1zm.75-10H1v1.5h2V2zM1 7h2v1.5H1zm4.75 5H5v1.5h2V12zM5 2h2v1.5H5zm.75 5H5v1.5h2V7z" clip-rule="evenodd" shape-rendering="geometricprecision" transform-origin="0 0"/>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  support: {
    symbol:
      '<path fill="currentColor" fill-rule="evenodd" d="M14.5 8c0 1.1-.28 2.15-.77 3.06L11.34 9.7a3.7 3.7 0 0 0 0-3.4l2.4-1.36q.74 1.38.76 3.06m-3.44-5.73a6.5 6.5 0 0 0-6.12 0L6.3 4.66a3.7 3.7 0 0 1 3.4 0zM9.7 11.34l1.36 2.4a6.5 6.5 0 0 1-6.12 0l1.36-2.4a3.7 3.7 0 0 0 3.4 0M4.66 9.7a3.7 3.7 0 0 1 0-3.4l-2.4-1.36a6.5 6.5 0 0 0 0 6.12zM16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-5.5 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" clip-rule="evenodd" shape-rendering="geometricprecision" transform-origin="0 0"/>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  performance: {
    symbol:
      '<path fill="currentColor" fill-rule="evenodd" d="M9 1.58A6.5 6.5 0 0 0 3.4 12.6l.53.53-1.06 1.06-.53-.53A8 8 0 0 1 9.97.24zm4.83 3.54a6.5 6.5 0 0 1-1.23 7.48l-.53.53 1.06 1.06.53-.53a8 8 0 0 0 1.15-9.87zM8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2m0 1.5a2.5 2.5 0 0 0 1.98-4.03l3.47-4.33a8 8 0 0 0-1.2-.91L8.76 5.6A2.5 2.5 0 1 0 8 10.5" clip-rule="evenodd" shape-rendering="geometricprecision" transform-origin="0 0"/>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  rpm: {
    symbol:
      '<path fill="currentColor" d="M12 2.954a10 10 0 0 1 6.222 17.829A1 1 0 0 1 17.6 21H6.4a1 1 0 0 1-.622-.217A10 10 0 0 1 12 2.954m4.207 5.839a1 1 0 0 0-1.414 0l-2.276 2.274a2.003 2.003 0 0 0-2.514 1.815L10 13a2 2 0 1 0 3.933-.517l2.274-2.276a1 1 0 0 0 0-1.414"/>',
    viewBox: '0 0 24 24',
    set: 'tabler'
  },
  github: {
    symbol:
      '<path fill="currentColor" d="M5.111 8.644c-1.48-.184-2.526-1.245-2.528-2.632 0-.563.2-1.168.544-1.572-.148-.373-.12-1.16.045-1.481.45-.056 1.055.184 1.411.505.424-.136.872-.2 1.425-.203.552 0 1 .071 1.407.19.344-.312.968-.552 1.413-.492.155.302.184 1.091.035 1.47.36.424.552 1 .552 1.583 0 1.384-1.048 2.424-2.549 2.62.379.248.64.788.64 1.405v1.168c0 .338.28.528.613.387a5.71 5.71 0 0 0 3.632-5.319c0-3.177-2.585-5.769-5.76-5.769C2.807.504.247 3.096.247 6.273c0 2.49 1.583 4.56 3.72 5.335.302.113.598-.088.598-.396v-.9a1.5 1.5 0 0 1-.542.112c-.744 0-1.176-.408-1.491-1.152-.12-.303-.261-.486-.522-.516-.136-.008-.183-.071-.179-.14 0-.136.226-.232.448-.233.328 0 .605.2.899.617.226.328.457.472.747.473.28 0 .456-.104.717-.361.19-.189.338-.36.469-.469" font-size="3.496"/>',
    viewBox: '0 0 12 12',
    set: 'svg'
  },
  'chevron-down': {
    symbol:
      '<path fill="none" stroke="oklch(14.5% 0 0)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9s-4.419 6-6 6-6-6-6-6" transform-origin="0 0"/>',
    viewBox: '0 0 24 24',
    set: 'svg'
  },
  checks: {
    symbol:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.929 11.829L7.17 16.07m4.95-4.95l4.95-4.95m-9.141 5.66l4.242 4.242l9.9-9.9"/>',
    viewBox: '0 0 24 24',
    set: 'mingcute'
  },
  knob: {
    symbol:
      '<path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m1 8h-2V4.1c.3-.1.7-.1 1-.1s.7 0 1 .1z"/>',
    viewBox: '0 0 24 24',
    set: 'mdi'
  },
  webhook: {
    symbol:
      '<path fill="currentColor" d="M10.46 19C9 21.07 6.15 21.59 4.09 20.15c-2.05-1.44-2.53-4.31-1.09-6.4a4.59 4.59 0 0 1 3.58-1.98l.05 1.43c-.91.07-1.79.54-2.36 1.36c-1 1.44-.69 3.38.68 4.35c1.38.96 3.31.59 4.31-.84c.31-.45.49-.94.56-1.44v-1.01l5.58-.04l.07-.11c.53-.92 1.68-1.24 2.58-.72a1.9 1.9 0 0 1 .68 2.6c-.53.91-1.69 1.23-2.59.71c-.41-.23-.7-.6-.83-1.02l-4.07.02a5 5 0 0 1-.78 1.94m7.28-7.14c2.53.31 4.33 2.58 4.02 5.07c-.31 2.5-2.61 4.27-5.14 3.96a4.63 4.63 0 0 1-3.43-2.21l1.24-.72a3.22 3.22 0 0 0 2.32 1.45c1.75.21 3.3-.98 3.51-2.65s-1.03-3.2-2.76-3.41c-.54-.06-1.06.01-1.53.18l-.85.44l-2.58-4.77h-.22a1.906 1.906 0 0 1-1.85-1.95c.03-1.04.93-1.85 1.98-1.81c1.05.06 1.88.91 1.85 1.95c-.02.44-.19.84-.46 1.15l1.9 3.51c.62-.2 1.3-.27 2-.19M8.25 9.14c-1-2.35.06-5.04 2.37-6.02c2.32-.98 5 .13 6 2.48c.59 1.37.47 2.87-.2 4.07l-1.24-.72c.42-.81.49-1.8.09-2.73c-.68-1.6-2.49-2.37-4.04-1.72c-1.56.66-2.26 2.5-1.58 4.1c.28.66.75 1.17 1.32 1.51l.39.21l-3.07 4.99c.03.05.07.11.1.19c.49.91.15 2.06-.77 2.55c-.91.49-2.06.13-2.56-.81c-.49-.93-.15-2.08.77-2.57c.39-.21.82-.26 1.23-.17l2.31-3.77c-.47-.43-.87-.97-1.12-1.59"/>',
    viewBox: '0 0 24 24',
    set: 'mdi'
  },
  directions: {
    symbol:
      '<g fill="currentColor"><path d="M43 8a3 3 0 1 0-6 0zm-6 4a3 3 0 1 0 6 0zm6 16a3 3 0 1 0-6 0zm-6 6.062a3 3 0 1 0 6 0zm6 16a3 3 0 0 0-6 0zM37 72a3 3 0 1 0 6 0zm0-64v4h6V8zm0 20v6.062h6V28zm0 22.062V72h6V50.062z"/><path d="M16 13.5a1.5 1.5 0 0 1 1.5-1.5h45.672a2 2 0 0 1 1.414.586l6 6a2 2 0 0 1 0 2.828l-6 6a2 2 0 0 1-1.414.586H17.5a1.5 1.5 0 0 1-1.5-1.5zm48 22.062a1.5 1.5 0 0 0-1.5-1.5H16.828a2 2 0 0 0-1.414.585l-6 6a2 2 0 0 0 0 2.829l6 6a2 2 0 0 0 1.414.586H62.5a1.5 1.5 0 0 0 1.5-1.5z"/></g>',
    viewBox: '0 0 80 80',
    set: 'glyphs'
  },
  'email-plus': {
    symbol:
      '<path fill="currentColor" d="M13 19c0-.34.04-.67.09-1H4V8l8 5l8-5v5.09c.72.12 1.39.37 2 .72V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9.09c-.05-.33-.09-.66-.09-1m7-13l-8 5l-8-5zm0 9v3h3v2h-3v3h-2v-3h-3v-2h3v-3z"/>',
    viewBox: '0 0 24 24',
    set: 'mdi'
  },
  'arrow-right-col-fill': {
    symbol:
      '<g fill="currentColor"><path d="M3 14a1 1 0 0 0 1 1h11.001v-.092a3 3 0 0 1 5.12-2.03a.515.515 0 0 0 .879-.363V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3z"/><path d="M3 18a1 1 0 0 0 1 1h14.584l-1.291 1.293a1 1 0 0 0-.083 1.32l.083.094a1 1 0 0 0 1.414 0l3-3q.054-.053.097-.112l.071-.11l.054-.114l.035-.105l.03-.149L22 18l-.003-.075l-.017-.126l-.03-.111l-.044-.111l-.052-.098l-.067-.096l-.08-.09l-3-3a1 1 0 0 0-1.414 1.414L18.586 17H4a1 1 0 0 0-1 1"/></g>',
    viewBox: '0 0 24 24',
    set: 'tabler'
  },
  vercel: {
    symbol: '<path fill="currentColor" d="m13.855 0 13.858 24H0z"/>',
    viewBox: '0 0 27.72 24',
    set: 'svg'
  },
  'spinner-blocks': {
    symbol: `<rect width="7.33" height="7.33" x="1" y="1" fill="currentColor"><animate id="SVGzjrPLenI" attributeName="x" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="1;4;1"/><animate attributeName="y" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="1;4;1"/><animate attributeName="width" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="0;SVGXAURnSRI.end+0.2s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="8.33" y="1" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="1;4;1"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="1" y="8.33" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="1;4;1"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.1s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="15.66" y="1" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="1;4;1"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="8.33" y="8.33" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="1" y="15.66" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="1;4;1"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.2s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="15.66" y="8.33" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="8.33" y="15.66" fill="currentColor"><animate attributeName="x" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="8.33;11.33;8.33"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.3s" dur="0.6s" values="7.33;1.33;7.33"/></rect><rect width="7.33" height="7.33" x="15.66" y="15.66" fill="currentColor"><animate id="SVGXAURnSRI" attributeName="x" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="y" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="15.66;18.66;15.66"/><animate attributeName="width" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33"/><animate attributeName="height" begin="SVGzjrPLenI.begin+0.4s" dur="0.6s" values="7.33;1.33;7.33"/></rect>`,
    viewBox: '0 0 24 24',
    set: 'svg-spinners'
  },
  'checkbox-checked': {
    symbol:
      '<path fill="currentColor" fill-rule="evenodd" d="M16.25 21A4.75 4.75 0 0 0 21 16.25v-8.5A4.75 4.75 0 0 0 16.25 3h-8.5A4.75 4.75 0 0 0 3 7.75v8.5A4.75 4.75 0 0 0 7.75 21zm.792-12.423a.75.75 0 0 0-1.06 0l-5.258 5.256-2.706-2.703a.75.75 0 1 0-1.06 1.062l3.237 3.232a.75.75 0 0 0 1.06 0l5.787-5.787a.75.75 0 0 0 0-1.06" clip-rule="evenodd"/>',
    viewBox: '0 0 24 24',
    set: 'svg'
  },
  'checkbox-unchecked': {
    symbol:
      '<rect width="16.5" height="16.5" x="3.75" y="3.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" rx="4"/>',
    viewBox: '0 0 24 24',
    set: 'proicons'
  },
  'checkbox-indeterminate': {
    symbol:
      '<g fill="none"><rect width="18.5" height="18.5" x="2.75" y="2.75" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" rx="4"/><path fill="currentColor" d="M7.113 6.25a.86.86 0 0 0-.863.862v9.775c0 .477.386.863.862.863h9.775a.863.863 0 0 0 .863-.863V7.114a.863.863 0 0 0-.863-.863z"/></g>',
    viewBox: '0 0 24 24',
    set: 'proicons'
  },
  rook: {
    symbol:
      '<path d="M12.586 15.026h-9.3v-1.86h9.3zM10.829 4.77H9.278V2.83H6.724v1.94H5.043V2.83H3.362v3.524h9.148V2.83h-1.68zm.724 2.084H4.32v5.816h7.234z" fill="currentColor"/>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  horse: {
    symbol:
      '<path d="M7.32.617a6 6 0 0 0-2.347.494l1.544 3.276q.447-.266.967-.466L8.013.646A7 7 0 0 0 7.32.617m1.266.106-.482 2.99a9 9 0 0 1 1.721-.304l.074-.006 2.109-1.297C10.833 1.368 9.68.914 8.586.723m-4.133.646c-.58.324-1.11.749-1.576 1.265q-.404.448-.742.99l2.66 2.302A5.9 5.9 0 0 1 6.03 4.708zm5.27 2.634c-3.05.294-4.612 1.832-5.345 3.96-.724 2.099-.586 4.791-.056 7.314h7.198c-.407-1.59-1.14-2.342-1.721-2.992-.311-.35-.594-.678-.705-1.115-.093-.362-.044-.767.16-1.24-.37-.118-.809-.123-1.337.006l-.137-.563c.907-.222 1.713-.108 2.321.35.566.425.936 1.12 1.13 2.02.809.137 1.714.241 2.777.295.14-.949.48-1.888.957-2.817-2.072-1.551-3.74-3.345-5.242-5.218m-7.881.133a9.4 9.4 0 0 0-.86 2.497l2.891 1.022a7 7 0 0 1 .595-1.247zM8.69 5.448a.78.78 0 1 1 0 1.56.78.78 0 0 1 0-1.56M.88 7.211A13 13 0 0 0 .75 9.333l2.627.508q.094-.848.317-1.635zM.772 9.927q.045.803.178 1.663l2.347.046q-.012-.616.028-1.215zm.28 2.244q.144.766.362 1.57l2.023-.211a19 19 0 0 1-.118-1.315zm2.465 1.933-1.94.203a24 24 0 0 0 .306.952h1.84a24 24 0 0 1-.206-1.155" fill="currentColor"/>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  pie: {
    symbol:
      '<g transform="scale(0.667)"><path d="M9.883 2.207a1.9 1.9 0 0 1 2.087 1.522l.025.167L12 4v7a1 1 0 0 0 .883.993L13 12h6.8a2 2 0 0 1 2 2 1 1 0 0 1-.026.226A10 10 0 1 1 9.504 2.293l.27-.067z" fill="currentColor"/><path d="M14 3.5V9a1 1 0 0 0 1 1h5.5a1 1 0 0 0 .943-1.332 10 10 0 0 0-6.11-6.111A1 1 0 0 0 14 3.5" fill="currentColor"/></g>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  player: {
    symbol:
      '<g transform="scale(0.667)"><path d="M18 3a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM9 9v6a1 1 0 0 0 1.514.857l5-3a1 1 0 0 0 0-1.714l-5-3A1 1 0 0 0 9 9" fill="currentColor"/></g>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  history: {
    symbol:
      '<g transform="scale(0.063)"><path fill="currentColor" d="M136 80v43.47l36.12 21.67a8 8 0 0 1-8.24 13.72l-40-24A8 8 0 0 1 120 128V80a8 8 0 0 1 16 0m-8-48a95.44 95.44 0 0 0-67.92 28.15C52.81 67.51 46.35 74.59 40 82V64a8 8 0 0 0-16 0v40a8 8 0 0 0 8 8h40a8 8 0 0 0 0-16H49c7.15-8.42 14.27-16.35 22.39-24.57a80 80 0 1 1 1.66 114.75 8 8 0 1 0-11 11.64A96 96 0 1 0 128 32" transform-origin="0 0"/></g>',
    viewBox: '0 0 16 16',
    set: 'svg'
  },
  'add-user': {
    symbol:
      '<g transform="scale(0.667)"><g fill="none"><circle cx="10" cy="8" r="5" fill="currentColor"/><path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M19 10v6m3-3h-6" fill="currentColor"/><path fill="currentColor" d="M17.142 20.383c.462-.105.739-.585.534-1.012-.552-1.15-1.459-2.162-2.634-2.924C13.595 15.509 11.823 15 10 15s-3.595.508-5.042 1.447c-1.175.762-2.082 1.773-2.634 2.924-.205.427.072.907.534 1.012a32.3 32.3 0 0 0 14.284 0"/></g></g>',
    viewBox: '0 0 16 16',
    set: 'svg'
  }
}
