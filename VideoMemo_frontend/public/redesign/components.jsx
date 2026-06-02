/* components.jsx — shared UI primitives. Exports to window. */
const { useState, useRef, useEffect } = React;

/* Brand logo mark — play triangle over note lines, themed */
function BrandMark({ size = 38 }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none">
        <path d="M8 5.5 L8 13 L15 9.2 Z" fill="currentColor"/>
        <rect x="5.5" y="16" width="13" height="2" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="5.5" y="19.4" width="8.5" height="2" rx="1" fill="currentColor" opacity="0.6"/>
      </svg>
    </div>
  );
}

/* Custom select with optional glyph rendering */
function Select({ value, onChange, options, placeholder, renderOption, width }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position: 'relative', width: width || '100%' }}>
      <button type="button" className="select-trigger" onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {cur ? (renderOption ? renderOption(cur) : cur.label) : <span className="faint">{placeholder}</span>}
        </span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'grid' }}>
          {Icons.chevd({ size: 16 })}
        </span>
      </button>
      {open && (
        <div className="fade-up" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-md)', padding: 6, maxHeight: 300, overflowY: 'auto',
        }}>
          {options.map(o => (
            <button key={o.value} type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                padding: '9px 10px', borderRadius: 'calc(var(--radius-sm) - 2px)', border: 'none',
                background: o.value === value ? 'var(--primary-soft)' : 'transparent',
                color: o.value === value ? 'var(--primary-strong)' : 'var(--text)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent'; }}>
              {renderOption ? renderOption(o) : o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, en, hint, tip, children }) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        {en && <span className="field-hint">{en}</span>}
        {hint && <span className="field-hint" style={{ marginLeft: 2 }}>· {hint}</span>}
        {tip && <span className="field-tip" title={tip} style={{ marginLeft: 'auto' }}>{Icons.bot ? Icons.gauge({ size: 14 }) : null}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, disabled, onClick, children }) {
  return (
    <button type="button" className={'chip' + (on ? ' on' : '')} disabled={disabled} onClick={onClick}>
      <span className="chk">{on && Icons.check({ size: 11 })}</span>
      {children}
    </button>
  );
}

function Toggle({ on, onClick }) {
  return <button type="button" className={'toggle' + (on ? ' on' : '')} onClick={onClick}><i/></button>;
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} type="button"
          className={'seg-item' + (o.value === value ? ' active' : '')}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status, lang }) {
  if (status === 'SUCCESS') return <span className="badge badge-ok"><span className="dot"/>{tr(lang, 'done')}</span>;
  if (status === 'FAILED')  return <span className="badge badge-danger"><span className="dot"/>{tr(lang, 'failed')}</span>;
  return <span className="badge badge-warn"><span className="dot" style={{ animation: 'pulse-ring 1.5s infinite' }}/>{tr(lang, 'running')}</span>;
}

Object.assign(window, { BrandMark, Select, Field, Chip, Toggle, Segmented, StatusBadge });
