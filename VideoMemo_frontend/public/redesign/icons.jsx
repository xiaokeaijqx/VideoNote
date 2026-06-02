/* icons.jsx — Lucide-style inline icons + platform glyphs. Exports to window. */
const S = ({ children, size = 20, sw = 2 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const Icons = {
  grid: (p) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></S>,
  library: (p) => <S {...p}><path d="M4 4v16M9 4v16"/><rect x="13" y="4" width="7" height="16" rx="1" transform="rotate(8 16 12)"/></S>,
  search: (p) => <S {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></S>,
  tasks: (p) => <S {...p}><path d="M3 6h.01M3 12h.01M3 18h.01"/><path d="M8 6h13M8 12h13M8 18h13"/></S>,
  stack: (p) => <S {...p}><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/></S>,
  book: (p) => <S {...p}><path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2Z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22Z"/></S>,
  sliders: (p) => <S {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></S>,
  bot: (p) => <S {...p}><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01M2 14h2M20 14h2"/></S>,
  plus: (p) => <S {...p}><path d="M12 5v14M5 12h14"/></S>,
  check: (p) => <S {...p}><path d="M20 6 9 17l-5-5"/></S>,
  x: (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12"/></S>,
  loader: (p) => <S {...p}><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></S>,
  link: (p) => <S {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></S>,
  image: (p) => <S {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></S>,
  listtree: (p) => <S {...p}><path d="M21 12h-8M21 6h-8M21 18h-8M3 4v14a2 2 0 0 0 2 2h3M3 10h5"/></S>,
  sparkles: (p) => <S {...p}><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z"/><path d="M19 4v3M20.5 5.5h-3M5 17v2M6 18H4"/></S>,
  eye: (p) => <S {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></S>,
  retry: (p) => <S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></S>,
  trash: (p) => <S {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></S>,
  external: (p) => <S {...p}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></S>,
  checkc: (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></S>,
  xc: (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></S>,
  upload: (p) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></S>,
  video: (p) => <S {...p}><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 9 6-3v12l-6-3"/></S>,
  filetext: (p) => <S {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></S>,
  wand: (p) => <S {...p}><path d="m3 21 12-12M14 4l1.5 1.5M18.5 8.5 20 10M15 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></S>,
  pause: (p) => <S {...p}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></S>,
  arrowr: (p) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6"/></S>,
  globe: (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></S>,
  clock: (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>,
  cpu: (p) => <S {...p}><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></S>,
  gauge: (p) => <S {...p}><path d="M12 14 16 9"/><path d="M5.5 18a9 9 0 1 1 13 0Z"/></S>,
  languages: (p) => <S {...p}><path d="M5 8h7M9 4v4c0 4-2 6-5 7M7 9c0 3 3 5 6 6"/><path d="m13 20 4-9 4 9M14.5 17h5"/></S>,
  waveform: (p) => <S {...p}><path d="M2 12h2M6 8v8M10 4v16M14 7v10M18 9v6M22 12h0"/></S>,
  download: (p) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></S>,
  chevd: (p) => <S {...p}><path d="m6 9 6 6 6-6"/></S>,
  inbox: (p) => <S {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5Z"/></S>,
  scissors: (p) => <S {...p}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 12.5 20 20M8.1 8.1 12 12"/></S>,
  layers: (p) => <S {...p}><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5"/></S>,
  zap: (p) => <S {...p}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/></S>,
  copy: (p) => <S {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></S>,
  share: (p) => <S {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/></S>,
  folder: (p) => <S {...p}><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/></S>,
  send: (p) => <S {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></S>,
  filter: (p) => <S {...p}><path d="M3 5h18l-7 8v6l-4-2v-4Z"/></S>,
  calendar: (p) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></S>,
  pencil: (p) => <S {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></S>,
  more: (p) => <S {...p}><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></S>,
  mindmap: (p) => <S {...p}><rect x="3" y="9" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="5" rx="1.5"/><rect x="15" y="16" width="6" height="5" rx="1.5"/><path d="M9 12h3v-5.5h3M12 12v6.5h3"/></S>,
  play: (p) => <S {...p}><path d="M6 4v16l13-8Z"/></S>,
  bookmark: (p) => <S {...p}><path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></S>,
  panelLeft: (p) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></S>,
  refresh: (p) => <S {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></S>,
  user: (p) => <S {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></S>,
  quote: (p) => <S {...p}><path d="M6 7H3v6h3v-2c0 1.5-.5 3-2 4M15 7h-3v6h3v-2c0 1.5-.5 3-2 4"/></S>,
  github: (p) => <S {...p}><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></S>,
  cloud: (p) => <S {...p}><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 6.5 19Z"/></S>,
  info: (p) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></S>,
  star: (p) => <S {...p}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9Z"/></S>,
  rocket: (p) => <S {...p}><path d="M5 14c-2 1-3 4-3 7 3 0 6-1 7-3M9 11a8 8 0 0 1 8-8c2 0 3 1 3 3a8 8 0 0 1-8 8Zm0 0-3.5-.5c-.4 0-.8.1-1 .4l-2 2 4 1m2.5 2.5.5 3.5c0 .4-.1.8-.4 1l-2 2-1-4M15 9a1 1 0 1 0 0-.01"/></S>,
};

/* Platform brand glyphs (color + short label avatar) */
const PLATFORMS = {
  bilibili:    { zh: '哔哩哔哩', en: 'Bilibili', short: 'B', color: '#FB7299' },
  youtube:     { zh: 'YouTube',  en: 'YouTube',  short: 'YT', color: '#FF0033' },
  douyin:      { zh: '抖音',     en: 'Douyin',   short: '抖', color: '#161823' },
  kuaishou:    { zh: '快手',     en: 'Kuaishou', short: '快', color: '#FF5000' },
  xiaohongshu: { zh: '小红书',   en: 'RED',      short: '红', color: '#FF2442' },
  local:       { zh: '本地视频', en: 'Local',    short: '⬡', color: '#64748B' },
};

const Pf = ({ id, sm }) => {
  const p = PLATFORMS[id] || { short: '?', color: '#94a3b8' };
  return <div className={'pf' + (sm ? ' pf-sm' : '')} style={{ background: p.color }}>{p.short}</div>;
};

Object.assign(window, { Icons, PLATFORMS, Pf });
