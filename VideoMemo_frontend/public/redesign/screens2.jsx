/* screens2.jsx — BatchImport, TaskList, generic placeholder pages. */
const { useState: useS2, useMemo: useM2 } = React;

/* ============ BATCH IMPORT ============ */
function BatchImport({ lang, onGoTasks }) {
  const sample = lang === 'zh'
    ? 'https://www.bilibili.com/video/BV1xx411c7mD\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://v.douyin.com/iJ8kРeq/\n随便一段不是链接的文字\nhttps://www.xiaohongshu.com/explore/abc123'
    : 'https://www.bilibili.com/video/BV1xx411c7mD\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://v.douyin.com/iJ8kPeq/\nnot-a-real-link\nhttps://www.xiaohongshu.com/explore/abc123';
  const [text, setText] = useS2(sample);
  const [model, setModel] = useS2('deepseek-v4-flash');
  const [style, setStyle] = useS2('minimal');
  const [quality, setQuality] = useS2('medium');
  const [formats, setFormats] = useS2(['toc', 'summary']);

  const parsed = useM2(() => {
    const lines = [...new Set(text.split('\n').map(s => s.trim()).filter(Boolean))];
    const valid = [], invalid = [];
    lines.forEach(l => { const p = detectPlatform(l); if (p) valid.push({ url: l, platform: p }); else invalid.push(l); });
    return { valid, invalid, total: lines.length };
  }, [text]);

  const models = ['deepseek-v4-flash','gpt-4o-mini','gpt-4o','claude-3.5-sonnet','qwen2.5-72b'].map(v=>({value:v,label:v}));
  const toggleFmt = (v) => setFormats(f => f.includes(v) ? f.filter(x=>x!==v) : [...f, v]);

  return (
    <div className="content-inner wide fade-up">
      <div style={{ display:'grid', gridTemplateColumns:'1.35fr 1fr', gap: 20, alignItems:'start' }}>
        {/* LEFT: links + queue */}
        <div className="col" style={{ gap: 20, minWidth: 0 }}>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent:'space-between', marginBottom: 12 }}>
              <div className="row"><span className="sec-title">{tr(lang,'links')}</span><span className="sec-en" style={{marginLeft:8}}>{tr(lang,'linksHint')}</span></div>
              {parsed.total > 0 && (
                <div className="row" style={{ gap: 10, fontSize: 12.5, fontWeight: 700 }}>
                  <span style={{ color:'var(--ok)', display:'flex', alignItems:'center', gap:4 }}>{Icons.checkc({size:14})} {parsed.valid.length} {tr(lang,'valid')}</span>
                  {parsed.invalid.length > 0 && <span style={{ color:'var(--danger)', display:'flex', alignItems:'center', gap:4 }}>{Icons.xc({size:14})} {parsed.invalid.length} {tr(lang,'invalid')}</span>}
                </div>
              )}
            </div>
            <textarea className="textarea input-mono" rows={7} value={text} onChange={e=>setText(e.target.value)}
              placeholder={'https://www.bilibili.com/video/BV...\nhttps://www.youtube.com/watch?v=...'} />
            {parsed.invalid.length > 0 && (
              <div style={{ marginTop: 12, padding:'10px 13px', borderRadius:'var(--radius-sm)', background:'var(--danger-soft)', color:'var(--danger)', fontSize:13 }}>
                <div style={{ fontWeight:700, marginBottom:4 }}>{tr(lang,'willSkip')}</div>
                {parsed.invalid.slice(0,3).map((u,i)=><div key={i} style={{ opacity:.85, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u}</div>)}
              </div>
            )}
          </div>

          {/* queue */}
          <div className="card" style={{ overflow:'hidden' }}>
            <div className="row" style={{ justifyContent:'space-between', padding:'15px 20px', borderBottom:'1px solid var(--border)' }}>
              <div className="row"><span className="sec-title">{tr(lang,'queue')}</span></div>
              <span className="badge badge-neutral">{parsed.valid.length}</span>
            </div>
            {parsed.valid.length === 0 ? (
              <div style={{ padding:'46px 20px', textAlign:'center', color:'var(--faint)' }}>
                <div style={{ display:'grid', placeItems:'center', marginBottom:10 }}>{Icons.stack({size:30})}</div>
                <div style={{ fontSize:13.5 }}>{tr(lang,'emptyQueue')}</div>
              </div>
            ) : (
              <div>
                {parsed.valid.map((v, i) => (
                  <div key={i} className="row" style={{ gap: 12, padding:'12px 20px', borderBottom: i<parsed.valid.length-1?'1px solid var(--border)':'none' }}>
                    <span className="mono faint" style={{ width: 22, fontSize: 12, textAlign:'right' }}>{i+1}</span>
                    <Pf id={v.platform} sm />
                    <span className="mono grow" style={{ fontSize:12.5, minWidth: 0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.url}</span>
                    <span className="badge badge-neutral">{PLATFORMS[v.platform][lang]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: shared options (sticky) */}
        <div className="card card-pad" style={{ position:'sticky', top: 20, minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 16 }}><span className="sec-title">{tr(lang,'options')}</span><span className="sec-en" style={{marginLeft:8}}>{lang==='zh'?'applied to all':'应用到全部'}</span></div>
          <Field label={tr(lang,'model')}>
            <Select value={model} onChange={setModel} options={models}
              renderOption={(o)=><span style={{display:'flex',alignItems:'center',gap:8}}><span style={{color:'var(--primary)',display:'grid'}}>{Icons.bot({size:16})}</span>{o.label}</span>} />
          </Field>
          <Field label={tr(lang,'noteStyle')}>
            <Select value={style} onChange={setStyle} options={NOTE_STYLES.map(s=>({value:s.value,label:s[lang]}))} />
          </Field>
          <Field label={tr(lang,'quality')}>
            <Segmented value={quality} onChange={setQuality} options={QUALITIES.map(q=>({value:q.value,label:q[lang]}))} />
          </Field>
          <Field label={tr(lang,'contents')}>
            <div className="chip-row">
              {FORMATS.map(f => (
                <Chip key={f.value} on={formats.includes(f.value)} onClick={()=>toggleFmt(f.value)}>
                  <span style={{display:'grid',color:formats.includes(f.value)?'var(--primary)':'var(--faint)'}}>{Icons[f.icon]({size:14})}</span>{f[lang]}
                </Chip>
              ))}
            </div>
          </Field>
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 6 }} disabled={parsed.valid.length===0} onClick={onGoTasks}>
            {Icons.stack({size:18})} {tr(lang,'batchGen')} ({parsed.valid.length})
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ TASK LIST ============ */
function TaskList({ lang, onNew }) {
  const [filter, setFilter] = useS2('all');
  const [empty, setEmpty] = useS2(false);
  const tasks = empty ? [] : SAMPLE_TASKS;

  const counts = {
    all: tasks.length,
    RUNNING: tasks.filter(t=>t.status==='RUNNING').length,
    SUCCESS: tasks.filter(t=>t.status==='SUCCESS').length,
    FAILED: tasks.filter(t=>t.status==='FAILED').length,
  };
  const shown = filter==='all' ? tasks : tasks.filter(t=>t.status===filter);

  const chips = [
    { id:'all', label: tr(lang,'all'), n: counts.all },
    { id:'RUNNING', label: tr(lang,'running'), n: counts.RUNNING },
    { id:'SUCCESS', label: tr(lang,'done'), n: counts.SUCCESS },
    { id:'FAILED', label: tr(lang,'failed'), n: counts.FAILED },
  ];

  return (
    <div className="content-inner wide fade-up">
      {/* filter row + demo toggle */}
      <div className="row" style={{ justifyContent:'space-between', marginBottom: 18 }}>
        <div className="row" style={{ gap: 8 }}>
          {chips.map(c => (
            <button key={c.id} onClick={()=>setFilter(c.id)}
              className={'chip' + (filter===c.id?' on':'')} style={{ height: 38 }}>
              {c.label}
              <span className="mono" style={{ fontSize:12, opacity:.7 }}>{c.n}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>setEmpty(e=>!e)} title="demo">
          {Icons.inbox({size:16})} {empty ? (lang==='zh'?'示例数据':'Show sample') : (lang==='zh'?'空状态':'Empty state')}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="card" style={{ padding:'56px 24px', textAlign:'center' }}>
          <EmptyTasksArt />
          <div style={{ fontSize:19, fontWeight:800, marginTop:8 }}>{tr(lang,'emptyTasks')}</div>
          <div className="muted" style={{ marginTop:6, fontSize:14 }}>{tr(lang,'emptyTasksSub')}</div>
          <button className="btn btn-primary" style={{ margin:'20px auto 0' }} onClick={onNew}>
            {Icons.plus({size:17})} {tr(lang,'emptyTasksCta')}
          </button>
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table className="tbl" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>{tr(lang,'colVideo')}</th>
                  <th>{tr(lang,'colPlatform')}</th>
                  <th>{tr(lang,'colModel')}</th>
                  <th>{tr(lang,'colStatus')}</th>
                  <th style={{ textAlign:'right' }}>{tr(lang,'colTokens')}</th>
                  <th>{tr(lang,'colStyle')}</th>
                  <th>{tr(lang,'colCreated')}</th>
                  <th style={{ textAlign:'right' }}>{tr(lang,'colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(t => {
                  const styleLabel = (NOTE_STYLES.find(s=>s.value===t.style)||{})[lang];
                  return (
                    <tr key={t.id}>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lang==='zh'?t.title:t.titleEn}</div>
                        {t.url
                          ? <a className="link mono" href={t.url} target="_blank" rel="noreferrer" style={{ fontSize:12, display:'flex', alignItems:'center', gap:4, maxWidth:280 }}><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.url}</span><span style={{flexShrink:0,display:'grid'}}>{Icons.external({size:11})}</span></a>
                          : <span className="faint mono" style={{ fontSize:12 }}>{lang==='zh'?'本地文件':'local file'}</span>}
                        {t.status==='RUNNING' && (
                          <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:8 }}>
                            <span className="badge badge-warn" style={{ fontSize:11 }}>{(STEPS.find(s=>s.key===t.step)||{})[lang]}</span>
                            <div style={{ flex:1, maxWidth:120, height:4, background:'var(--surface-3)', borderRadius:999, overflow:'hidden' }}>
                              <i style={{ display:'block', height:'100%', width: t.step==='SUMMARIZING'?'78%':'46%', background:'var(--primary)', borderRadius:999 }}/>
                            </div>
                          </div>
                        )}
                      </td>
                      <td><div className="row" style={{ gap:8 }}><Pf id={t.platform} sm /><span style={{ fontSize:13 }}>{PLATFORMS[t.platform][lang]}</span></div></td>
                      <td><span className="badge badge-neutral mono" style={{ fontSize:11.5 }}>{t.model}</span></td>
                      <td><StatusBadge status={t.status} lang={lang} /></td>
                      <td className="mono" style={{ textAlign:'right', color: t.tokens?'var(--text)':'var(--faint)' }}>{t.tokens ? t.tokens.toLocaleString() : '—'}</td>
                      <td><span style={{ fontSize:13 }} className="muted">{styleLabel}</span></td>
                      <td className="muted mono" style={{ fontSize:12.5 }}>{t.created}</td>
                      <td>
                        <div className="row" style={{ gap:2, justifyContent:'flex-end' }}>
                          <button className="icon-btn" title={tr(lang,'view')}>{Icons.eye({size:17})}</button>
                          <button className="icon-btn" title={tr(lang,'retry')}>{Icons.retry({size:16})}</button>
                          <button className="icon-btn" title={tr(lang,'del')}>{Icons.trash({size:16})}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ GENERIC PLACEHOLDER ============ */
function GenericPage({ lang, item }) {
  return (
    <div className="content-inner narrow fade-up" style={{ paddingTop: 80, textAlign:'center' }}>
      <div style={{ display:'grid', placeItems:'center', width:64, height:64, borderRadius:20, background:'var(--primary-soft)', color:'var(--primary)', margin:'0 auto 18px' }}>
        {Icons[item.icon]({size:28})}
      </div>
      <div style={{ fontSize:22, fontWeight:800 }}>{item[lang]}</div>
      <div className="muted" style={{ marginTop:8 }}>{lang==='zh'?'本次重设计聚焦在「新建 · 批量 · 任务」三块，这里保留占位。':'This redesign focuses on New · Batch · Tasks; this page is a placeholder.'}</div>
    </div>
  );
}

Object.assign(window, { BatchImport, TaskList, GenericPage });
