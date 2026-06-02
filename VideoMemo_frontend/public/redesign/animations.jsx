/* animations.jsx — themed loaders & empty-state illustrations. Exports to window. */
const { useState: useStateA, useEffect: useEffectA } = React;

/* inject keyframes once */
(function injectAnimCSS() {
  if (document.getElementById('vm-anim-css')) return;
  const css = `
  @keyframes wave { 0%,100%{ transform: scaleY(.35);} 50%{ transform: scaleY(1);} }
  @keyframes drawline { from { transform: scaleX(0); opacity:.3;} to { transform: scaleX(1); opacity:1; } }
  @keyframes scanmove { 0%{ transform: translateX(-10%);} 100%{ transform: translateX(110%);} }
  @keyframes rise { 0%{ transform: translateY(8px) scale(.6); opacity:0;} 20%{opacity:.9;} 100%{ transform: translateY(-34px) scale(1); opacity:0;} }
  @keyframes twinkle { 0%,100%{ opacity:.25; transform: scale(.8);} 50%{ opacity:1; transform: scale(1.15);} }
  @keyframes driftA { 0%,100%{ transform: translateY(0) rotate(-5deg);} 50%{ transform: translateY(-12px) rotate(-5deg);} }
  @keyframes driftB { 0%,100%{ transform: translateY(0) rotate(6deg);} 50%{ transform: translateY(-9px) rotate(6deg);} }
  @keyframes driftC { 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-16px);} }
  @keyframes dash { to { stroke-dashoffset: -28; } }
  @keyframes orbit { from { transform: rotate(0deg) translateX(86px) rotate(0deg);} to { transform: rotate(360deg) translateX(86px) rotate(-360deg);} }
  @keyframes breathe { 0%,100%{ transform: scale(1);} 50%{ transform: scale(1.04);} }
  `;
  const s = document.createElement('style');
  s.id = 'vm-anim-css'; s.textContent = css;
  document.head.appendChild(s);
})();

/* small animated waveform */
function WaveBars({ n = 5, w = 4, h = 22, gap = 3, color = 'var(--primary)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, height: h }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} style={{
          width: w, height: h, borderRadius: 999, background: color, display: 'block',
          transformOrigin: 'center', animation: `wave ${0.9 + (i % 3) * 0.18}s ease-in-out infinite`,
          animationDelay: `${i * 0.11}s`,
        }}/>
      ))}
    </div>
  );
}

/* Inline spinner used on buttons */
function Spinner({ size = 17 }) {
  return <span className="spin" style={{ display: 'grid' }}>{Icons.loader({ size })}</span>;
}

/* ---- Generation hero: video → waveform → notes, stage-aware ---- */
function GenHero({ stepIndex = 0, lang = 'zh' }) {
  // stages: 0 parse,1 download,2 transcribe,3 summarize,4 done
  const litVideo = stepIndex >= 0;
  const litWave  = stepIndex >= 1;
  const litNote  = stepIndex >= 3;
  const done = stepIndex >= 4;
  return (
    <div style={{ position: 'relative', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
      {/* rising particles */}
      {[0,1,2,3,4].map(i => (
        <span key={i} style={{
          position: 'absolute', bottom: 40, left: `${30 + i * 11}%`, width: 6, height: 6, borderRadius: 999,
          background: 'var(--accent)', opacity: 0,
          animation: `rise ${2.2 + i*0.3}s ease-in infinite`, animationDelay: `${i*0.45}s`,
        }}/>
      ))}

      {/* video frame */}
      <Stage lit={litVideo} active={stepIndex <= 1}>
        <div style={{ width: 78, height: 52, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: 0, height: 0, borderLeft: '13px solid var(--primary)', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', marginLeft: 3 }}/>
          {stepIndex <= 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, width: 22, background: 'linear-gradient(90deg,transparent,color-mix(in srgb,var(--primary) 22%,transparent),transparent)', animation: 'scanmove 1.8s linear infinite' }}/>}
        </div>
      </Stage>

      <Connector active={stepIndex >= 1} />

      {/* waveform pod */}
      <Stage lit={litWave} active={stepIndex === 1 || stepIndex === 2}>
        <div style={{ width: 78, height: 52, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-strong)', display: 'grid', placeItems: 'center' }}>
          {litWave ? <WaveBars n={6} h={20} color={'var(--primary)'} /> :
            <div style={{ color: 'var(--faint)' }}>{Icons.waveform({ size: 22 })}</div>}
        </div>
      </Stage>

      <Connector active={stepIndex >= 3} />

      {/* note page */}
      <Stage lit={litNote} active={stepIndex === 3 || done}>
        <div style={{ width: 56, height: 64, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border-strong)', padding: '9px 8px', display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' }}>
          {[78, 96, 64, 88].map((wpc, i) => (
            <span key={i} style={{
              height: 4, borderRadius: 2, background: litNote ? 'var(--primary)' : 'var(--surface-3)',
              width: wpc + '%', transformOrigin: 'left',
              opacity: litNote ? 1 : .6,
              animation: litNote ? `drawline .5s ease ${i*0.12}s both` : 'none',
            }}/>
          ))}
          {done && <div style={{ position: 'absolute', right: -8, bottom: -8, width: 26, height: 26, borderRadius: 999, background: 'var(--ok)', display: 'grid', placeItems: 'center', color: '#fff', boxShadow: 'var(--shadow-sm)', animation: 'breathe 1.6s ease-in-out infinite' }}>{Icons.check({ size: 15 })}</div>}
        </div>
      </Stage>
    </div>
  );
}
function Stage({ lit, active, children }) {
  return (
    <div style={{
      padding: 8, borderRadius: 16,
      background: active ? 'var(--primary-soft)' : 'transparent',
      transition: 'background .4s',
      animation: active ? 'breathe 2s ease-in-out infinite' : 'none',
      opacity: lit ? 1 : .45, position: 'relative', zIndex: 1,
    }}>{children}</div>
  );
}
function Connector({ active }) {
  return (
    <svg width="44" height="20" viewBox="0 0 44 20" style={{ flexShrink: 0 }}>
      <line x1="2" y1="10" x2="42" y2="10" stroke={active ? 'var(--primary)' : 'var(--surface-3)'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 6" style={{ animation: active ? 'dash .8s linear infinite' : 'none' }} />
      <path d="M36 5 L42 10 L36 15" fill="none" stroke={active ? 'var(--primary)' : 'var(--surface-3)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ---- Empty state: floating notes + video, inviting ---- */
function EmptyTasksArt() {
  return (
    <div style={{ position: 'relative', width: 240, height: 200, margin: '0 auto' }}>
      {/* soft halo */}
      <div style={{ position: 'absolute', inset: '24px 40px', background: 'var(--primary-soft)', borderRadius: '50%', filter: 'blur(28px)', opacity: .7 }}/>

      {/* dotted orbit path */}
      <svg viewBox="0 0 240 200" style={{ position: 'absolute', inset: 0 }}>
        <ellipse cx="120" cy="108" rx="92" ry="58" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="3 7" opacity=".7"/>
      </svg>

      {/* center note page */}
      <div style={{ position: 'absolute', left: 86, top: 64, width: 68, height: 82, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 7, animation: 'driftC 4s ease-in-out infinite' }}>
        {[90, 70, 96, 60].map((w, i) => <span key={i} style={{ height: 5, borderRadius: 3, width: w + '%', background: i === 0 ? 'var(--primary)' : 'var(--surface-3)' }}/>)}
      </div>

      {/* floating video chip top-left */}
      <div style={{ position: 'absolute', left: 18, top: 36, width: 54, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', display: 'grid', placeItems: 'center', animation: 'driftA 5s ease-in-out infinite' }}>
        <div style={{ width: 0, height: 0, borderLeft: '11px solid var(--primary)', borderTop: '7px solid transparent', borderBottom: '7px solid transparent', marginLeft: 3 }}/>
      </div>

      {/* waveform chip bottom-right */}
      <div style={{ position: 'absolute', right: 16, bottom: 30, width: 56, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', display: 'grid', placeItems: 'center', animation: 'driftB 4.4s ease-in-out infinite' }}>
        <WaveBars n={5} h={16} color="var(--accent)" />
      </div>

      {/* sparkles */}
      <span style={{ position: 'absolute', right: 40, top: 30, color: 'var(--accent)', animation: 'twinkle 2.2s ease-in-out infinite' }}>{Icons.sparkles({ size: 18 })}</span>
      <span style={{ position: 'absolute', left: 40, bottom: 36, color: 'var(--primary)', animation: 'twinkle 2.6s ease-in-out infinite', animationDelay: '.6s' }}>{Icons.sparkles({ size: 13 })}</span>
    </div>
  );
}

Object.assign(window, { WaveBars, Spinner, GenHero, EmptyTasksArt });
