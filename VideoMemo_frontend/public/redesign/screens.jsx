/* screens.jsx — NewNote (+ generation flow), BatchImport, TaskList, generic pages. */
const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM } = React;

function detectPlatform(url) {
  const u = (url || '').toLowerCase().trim();
  if (!u) return '';
  if (u.includes('bilibili.com') || u.includes('b23.tv')) return 'bilibili';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('douyin.com')) return 'douyin';
  if (u.includes('kuaishou.com') || u.includes('k://') ) return 'kuaishou';
  if (u.includes('xiaohongshu.com') || u.includes('xhslink')) return 'xiaohongshu';
  if (/^https?:\/\//.test(u)) return '';
  return '';
}

const pfOption = (lang) => (o) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <Pf id={o.value} sm /> <span>{PLATFORMS[o.value][lang]}</span>
  </span>
);

/* ============ NEW NOTE ============ */
function NewNote({ lang, onGoTasks }) {
  const [view, setView] = useS('form'); // form | flow
  const [platform, setPlatform] = useS('bilibili');
  const [url, setUrl] = useS('');
  const [touchedPf, setTouchedPf] = useS(false);
  const [model, setModel] = useS('deepseek-v4-flash');
  const [style, setStyle] = useS('minimal');
  const [quality, setQuality] = useS('medium');
  const [formats, setFormats] = useS(['toc', 'summary']);
  const [vision, setVision] = useS(false);
  const [interval, setIntervalV] = useS(6);
  const [cols, setCols] = useS(2);
  const [rows, setRows] = useS(2);

  // auto-detect platform from url
  useE(() => {
    if (platform === 'local' && touchedPf) return;
    const d = detectPlatform(url);
    if (d && d !== platform) setPlatform(d);
  }, [url]);

  const models = [
    { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'claude-3.5-sonnet', label: 'claude-3.5-sonnet' },
    { value: 'qwen2.5-72b', label: 'qwen2.5-72b' },
  ];
  const toggleFmt = (v) => setFormats(f => f.includes(v) ? f.filter(x => x !== v) : [...f, v]);

  if (view === 'flow') return <GenerationFlow lang={lang} platform={platform} url={url} style={style}
    onBack={() => setView('form')} onGoTasks={onGoTasks} />;

  return (
    <div className="content-inner narrow fade-up">
      {/* Source */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="sec-title">{tr(lang,'videoSource')}</div>
          <div className="sec-en">{lang==='zh'?'Video source':'视频来源'}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Select width={158} value={platform} onChange={(v)=>{setPlatform(v);setTouchedPf(true);}}
            options={[...Object.keys(PLATFORMS).map(k=>({value:k}))]} renderOption={pfOption(lang)} />
          {platform === 'local' ? (
            <input className="input grow input-mono" placeholder={tr(lang,'localPath')} value={url} onChange={e=>setUrl(e.target.value)} />
          ) : (
            <div style={{ position:'relative', flex:1 }}>
              <input className="input input-mono" style={{ paddingRight: detectPlatform(url) ? 110 : 13 }}
                placeholder={tr(lang,'pasteLink')} value={url} onChange={e=>setUrl(e.target.value)} />
              {detectPlatform(url) && (
                <span className="badge badge-ok" style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)' }}>
                  {Icons.checkc({size:13})} {tr(lang,'detected')}
                </span>
              )}
            </div>
          )}
        </div>
        {platform === 'local' && (
          <div onClick={()=>setUrl('/Users/me/Movies/review.mp4')} style={{
            marginTop: 12, height: 130, border: '2px dashed var(--border-strong)', borderRadius: 'var(--radius)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
            color:'var(--muted)', cursor:'pointer', background:'var(--surface-2)',
          }}>
            <div style={{ color:'var(--primary)' }}>{Icons.upload({size:26})}</div>
            <div style={{ fontWeight:600, fontSize:14 }}>{tr(lang,'dropFile')}</div>
          </div>
        )}
      </div>

      {/* Model + Style */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="grid-2">
          <Field label={tr(lang,'model')} en={lang==='zh'?'Model':'模型'}>
            <Select value={model} onChange={setModel} options={models}
              renderOption={(o)=><span style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:'var(--primary)',display:'grid'}}>{Icons.bot({size:16})}</span>{o.label}</span>} />
          </Field>
          <Field label={tr(lang,'noteStyle')} en={lang==='zh'?'Style':'风格'}>
            <Select value={style} onChange={setStyle}
              options={NOTE_STYLES.map(s=>({value:s.value,label:s[lang]}))} />
          </Field>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <div className="field-head"><span className="field-label">{tr(lang,'quality')}</span><span className="field-hint">{lang==='zh'?'Audio quality':'音频质量'}</span></div>
          <Segmented value={quality} onChange={setQuality}
            options={QUALITIES.map(q=>({value:q.value,label:`${q[lang]}`}))} />
        </div>
      </div>

      {/* Include */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <Field label={tr(lang,'contents')} en={lang==='zh'?'Include':'内容选项'} hint={tr(lang,'contentsHint')}>
          <div className="chip-row">
            {FORMATS.map(f => {
              const disabled = (f.value === 'link' && platform === 'local') || (f.value === 'screenshot' && !vision);
              return (
                <Chip key={f.value} on={formats.includes(f.value)} disabled={disabled} onClick={()=>toggleFmt(f.value)}>
                  <span style={{ display:'grid', color: formats.includes(f.value)?'var(--primary)':'var(--faint)' }}>{Icons[f.icon]({size:15})}</span>
                  {f[lang]}
                </Chip>
              );
            })}
          </div>
        </Field>

        {/* Vision */}
        <div className="divider" />
        <div className="row" style={{ justifyContent:'space-between' }}>
          <div className="row" style={{ gap: 11 }}>
            <span style={{ color: vision?'var(--primary)':'var(--faint)', display:'grid' }}>{Icons.image({size:19})}</span>
            <div>
              <div className="field-label">{tr(lang,'videoUnd')}</div>
              <div className="field-hint">{tr(lang,'videoUndHint')}</div>
            </div>
          </div>
          <Toggle on={vision} onClick={()=>setVision(v=>!v)} />
        </div>
        {vision && (
          <div className="fade-up" style={{ marginTop: 16 }}>
            <div className="grid-2">
              <Field label={tr(lang,'interval')}>
                <input className="input" type="number" min={1} max={30} value={interval} onChange={e=>setIntervalV(+e.target.value||6)} />
              </Field>
              <Field label={tr(lang,'grid')}>
                <div className="row">
                  <input className="input" style={{width:72}} type="number" value={cols} onChange={e=>setCols(+e.target.value||2)} />
                  <span className="muted">×</span>
                  <input className="input" style={{width:72}} type="number" value={rows} onChange={e=>setRows(+e.target.value||2)} />
                </div>
              </Field>
            </div>
            <div className="badge badge-warn" style={{ borderRadius:'var(--radius-sm)', padding:'9px 13px' }}>
              {Icons.bot({size:15})} {tr(lang,'visionWarn')}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card card-pad" style={{ marginBottom: 22 }}>
        <Field label={tr(lang,'notes')} en={lang==='zh'?'Optional':'可选'}>
          <textarea className="textarea" rows={3} placeholder={tr(lang,'notesPh')} />
        </Field>
      </div>

      <button className="btn btn-primary btn-lg btn-block" onClick={()=>setView('flow')}>
        {Icons.sparkles({size:19})} {tr(lang,'generate')}
      </button>
    </div>
  );
}

/* ============ GENERATION FLOW ============ */
function GenerationFlow({ lang, platform, url, style, onBack, onGoTasks }) {
  const [idx, setIdx] = useS(0);
  const [paused, setPaused] = useS(false);
  const [sec, setSec] = useS(0);
  const timer = useR();
  const clock = useR();

  useE(() => {
    clock.current = setInterval(()=>setSec(s=>s+1), 1000);
    return ()=>clearInterval(clock.current);
  }, []);
  useE(() => {
    if (paused || idx >= STEPS.length - 1) return;
    timer.current = setTimeout(()=>setIdx(i=>Math.min(i+1, STEPS.length-1)), idx===2?2600:1700);
    return ()=>clearTimeout(timer.current);
  }, [idx, paused]);

  const done = idx >= STEPS.length - 1;
  const canPause = idx < 3 && !done;
  const styleLabel = (NOTE_STYLES.find(s=>s.value===style)||{})[lang];
  const fmtSec = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;

  return (
    <div className="content-inner narrow fade-up" style={{ paddingTop: 44 }}>
      <div className="card" style={{ overflow:'hidden' }}>
        {/* header strip */}
        <div style={{ padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
          <div className="row" style={{ gap: 12 }}>
            <Pf id={platform} />
            <div>
              <div style={{ fontWeight:800, fontSize:16 }}>{done ? tr(lang,'flowDone') : tr(lang,'flowTitle')}</div>
              <div className="field-hint">{done ? tr(lang,'flowDoneSub') : tr(lang,'flowSub')}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span className="badge badge-neutral">{styleLabel}</span>
            <div className="row" style={{ gap:6, color:'var(--muted)', fontSize:13, fontWeight:600 }}>
              {Icons.clock({size:15})} <span className="mono">{fmtSec}</span>
            </div>
          </div>
        </div>

        {/* hero animation */}
        <div style={{ padding:'18px 24px 8px', background:'var(--surface-2)' }}>
          <GenHero stepIndex={idx} lang={lang} />
        </div>

        {/* stepper */}
        <div style={{ padding:'26px 30px 22px' }}>
          <div className="stepper">
            {STEPS.map((s, i) => (
              <div key={s.key} className={'step ' + (i < idx ? 'done' : i === idx ? 'active' : '')}>
                {i > 0 && <div className="step-line"><i style={{ width: i <= idx ? '100%' : '0' }}/></div>}
                <div className="step-dot">
                  {i < idx ? Icons.check({size:20}) : (i === idx && !done) ? <Spinner size={18} /> : Icons[s.icon]({size:18})}
                </div>
                <div className="step-label">{s[lang]}</div>
                <div className="step-en">{lang==='zh'?s.en:s.key.slice(0,1)+s.key.slice(1).toLowerCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* footer actions */}
        <div style={{ padding:'18px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--surface)' }}>
          {!done ? (
            <>
              <div className="field-hint" style={{ maxWidth: 360 }}>
                {idx >= 3 ? (lang==='zh'?'即将完成 — 总结阶段无法暂停':'Almost there — summarizing can’t be paused')
                          : (lang==='zh'?'前三步可随时暂停':'Pausable during the first three steps')}
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={onBack}>{Icons.x({size:16})} {lang==='zh'?'取消':'Cancel'}</button>
                <button className="btn btn-outline btn-sm" disabled={!canPause} onClick={()=>setPaused(p=>!p)}>
                  {paused ? Icons.arrowr({size:16}) : Icons.pause({size:16})} {paused ? (lang==='zh'?'继续':'Resume') : tr(lang,'pause')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="row" style={{ gap:9, color:'var(--ok)', fontWeight:700, fontSize:14 }}>
                {Icons.checkc({size:18})} {tr(lang,'flowDone')}
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-outline btn-sm" onClick={onBack}>{Icons.plus({size:16})} {tr(lang,'again')}</button>
                <button className="btn btn-primary btn-sm" onClick={onGoTasks}>{Icons.arrowr({size:16})} {tr(lang,'openNote')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewNote, GenerationFlow, detectPlatform, pfOption });
