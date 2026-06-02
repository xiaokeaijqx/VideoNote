/* screens4.jsx — Collections (grid + detail), Knowledge (cross-note RAG chat). */
const { useState: useS4, useRef: useR4, useEffect: useE4 } = React;

const COLLECTIONS = [
  { id:'ungrouped', name:{zh:'未分组', en:'Ungrouped'}, count:2, tag:null, ids:['n3','n5'], color:'#94A3B8', virtual:true },
  { id:'c1', name:{zh:'机器学习', en:'Machine learning'}, count:4, tag:'ai', ids:['n2','n3'], color:'#6366F1' },
  { id:'c2', name:{zh:'效率工具', en:'Productivity'}, count:3, tag:'tools', ids:['n1'], color:'#D2682F' },
  { id:'c3', name:{zh:'数字游民', en:'Digital nomad'}, count:5, tag:'life', ids:['n4'], color:'#2F8F6B' },
];

/* ============ COLLECTIONS ============ */
function Collections({ lang }) {
  const [detail, setDetail] = useS4(null);
  if (detail) return <CollectionDetail lang={lang} coll={detail} onBack={()=>setDetail(null)} />;
  return (
    <div className="content-inner wide fade-up">
      <div className="row" style={{ justifyContent:'space-between', marginBottom:20 }}>
        <div className="muted" style={{ fontSize:14, whiteSpace:'nowrap' }}>{COLLECTIONS.length} {lang==='zh'?'个合集':'collections'}</div>
        <button className="btn btn-primary btn-sm">{Icons.plus({size:16})} {lang==='zh'?'新建合集':'New collection'}</button>
      </div>
      <div className="coll-grid">
        {COLLECTIONS.map(c => (
          <div key={c.id} className="coll-card" onClick={()=>setDetail(c)}>
            <div className="coll-cover" style={{ background: c.virtual ? 'var(--surface-3)' : `linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 55%, #000))`, color: c.virtual?'var(--faint)':'#fff' }}>
              {c.virtual ? Icons.inbox({size:34}) : Icons.folder({size:34})}
            </div>
            <div className="coll-body">
              <div className="row" style={{ justifyContent:'space-between' }}>
                <div className="coll-name">{c.name[lang]}</div>
                {!c.virtual && <button className="icon-btn" style={{width:28,height:28}} onClick={e=>e.stopPropagation()}>{Icons.more({size:16})}</button>}
              </div>
              <div className="coll-meta">
                <span className="badge badge-neutral">{c.count} {tr(lang,'notesCount')}</span>
                {c.tag && <span className="badge" style={{ background:'var(--primary-soft)', color:'var(--primary-strong)' }}>#{c.tag}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollectionDetail({ lang, coll, onBack }) {
  const notes = NOTES.filter(n => coll.ids.includes(n.id));
  return (
    <div className="content-inner wide fade-up">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom:16, paddingLeft:6 }} onClick={onBack}>
        <span style={{ transform:'rotate(180deg)', display:'grid' }}>{Icons.arrowr({size:17})}</span> {lang==='zh'?'返回合集':'Back'}
      </button>
      <div className="row" style={{ gap:16, marginBottom:18 }}>
        <div style={{ width:72, height:72, borderRadius:'var(--radius)', display:'grid', placeItems:'center', color: coll.virtual?'var(--faint)':'#fff', background: coll.virtual?'var(--surface-3)':`linear-gradient(135deg, ${coll.color}, color-mix(in srgb, ${coll.color} 55%, #000))` }}>
          {coll.virtual ? Icons.inbox({size:30}) : Icons.folder({size:30})}
        </div>
        <div>
          <div className="row" style={{ gap:9 }}>
            <span style={{ fontSize:24, fontWeight:800 }}>{coll.name[lang]}</span>
            {!coll.virtual && <button className="icon-btn">{Icons.pencil({size:16})}</button>}
          </div>
          <div className="row" style={{ gap:8, marginTop:6 }}>
            {coll.tag && <span className="badge" style={{ background:'var(--primary-soft)', color:'var(--primary-strong)' }}>#{coll.tag}</span>}
            <span className="muted" style={{ fontSize:13.5, whiteSpace:'nowrap' }}>{coll.count} {tr(lang,'notesCount')}</span>
          </div>
        </div>
      </div>
      <div className="row" style={{ gap:9, marginBottom:22, flexWrap:'wrap' }}>
        <button className="btn btn-primary btn-sm">{Icons.plus({size:16})} {lang==='zh'?'添加笔记':'Add notes'}</button>
        <button className="btn btn-outline btn-sm">{Icons.zap({size:16})} {lang==='zh'?'闪卡学习':'Flashcards'}</button>
        <button className="btn btn-outline btn-sm">{Icons.download({size:16})} {lang==='zh'?'下载 ZIP':'Download ZIP'}</button>
        <button className="btn btn-outline btn-sm">{Icons.upload({size:16})} {lang==='zh'?'推送 Drive':'Push to Drive'}</button>
        <button className="btn btn-outline btn-sm">{Icons.share({size:16})} {lang==='zh'?'分享':'Share'}</button>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        {notes.map((n, i) => (
          <div key={n.id} className="row" style={{ gap:14, padding:'14px 18px', borderBottom: i<notes.length-1?'1px solid var(--border)':'none', cursor:'pointer' }}>
            <NoteThumb id={n.platform} className="note-thumb" />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title[lang]}</div>
              <div className="row" style={{ gap:8, marginTop:5 }}><Pf id={n.platform} sm /><span className="muted" style={{fontSize:13}}>{PLATFORMS[n.platform][lang]} · {n.created.slice(0,10)}</span></div>
            </div>
            <button className="icon-btn">{Icons.more({size:18})}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ KNOWLEDGE / RAG CHAT ============ */
function FilterOpt({ on, onClick, children }) {
  return <div className={'filter-opt'+(on?' on':'')} onClick={onClick}><span className="chk">{on&&Icons.check({size:12})}</span>{children}</div>;
}

function Knowledge({ lang, onOpenNote }) {
  const [scope, setScope] = useS4('all');
  const [pf, setPf] = useS4(['bilibili','youtube']);
  const [msgs, setMsgs] = useS4([]);
  const [input, setInput] = useS4('');
  const scrollRef = useR4(null);
  const togglePf = (p) => setPf(s => s.includes(p)?s.filter(x=>x!==p):[...s,p]);

  const examples = lang==='zh'
    ? ['这些视频里关于 Skills 的核心观点是什么？', '总结数字游民最常见的收入来源', '对比几个视频提到的安装步骤差异']
    : ['What are the core points about Skills across these videos?', 'Summarize common income sources for digital nomads', 'Compare the install steps mentioned'];

  const ask = (q) => {
    const question = (q ?? input).trim();
    if (!question) return;
    setInput('');
    setMsgs(m => [...m, { role:'user', text: question }]);
    setTimeout(() => {
      setMsgs(m => [...m, {
        role:'ai',
        text: lang==='zh'
          ? '综合你库里的 4 篇相关笔记，关于 Skills 的核心观点可以归纳为三点：①Skills 是可组合的能力插件，把复杂任务拆成可复用的步骤；②应按场景分组而非堆砌，4 组高频组合覆盖了大多数 Agent 工作流；③接入国产模型后成本显著下降。下面是引用来源：'
          : 'Across the 4 related notes in your library, the core points about Skills boil down to three: (1) Skills are composable capability plugins that break complex tasks into reusable steps; (2) group them by scenario rather than piling them up — 4 high-frequency groups cover most agent workflows; (3) cost drops sharply once a domestic model is connected. Sources:',
        sources: [
          { note:'n2', sec: lang==='zh'?'· 4 组顶级生产力组合':'· 4 top groups', platform:'bilibili' },
          { note:'n3', ts:'08:24', platform:'youtube' },
        ],
      }]);
    }, 700);
  };
  useE4(() => { if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs]);

  return (
    <div className="kn">
      {/* filter rail */}
      <div className="filter-rail">
        <div className="filter-group">
          <div className="filter-group-label">{lang==='zh'?'检索范围':'Scope'}</div>
          {[{v:'all',zh:'全部笔记库',en:'Whole library'},{v:'coll',zh:'指定合集',en:'A collection'},{v:'ungrouped',zh:'仅未分组',en:'Ungrouped only'}].map(o=>(
            <FilterOpt key={o.v} on={scope===o.v} onClick={()=>setScope(o.v)}>{o[lang]}</FilterOpt>
          ))}
        </div>
        <div className="filter-group">
          <div className="filter-group-label">{lang==='zh'?'平台':'Platform'}</div>
          {['bilibili','youtube','douyin','local'].map(p=>(
            <FilterOpt key={p} on={pf.includes(p)} onClick={()=>togglePf(p)}>
              <span className="row" style={{gap:7}}><Pf id={p} sm /> {PLATFORMS[p][lang]}</span>
            </FilterOpt>
          ))}
        </div>
        <button className="btn btn-outline btn-sm btn-block">{Icons.refresh({size:15})} {lang==='zh'?'重建索引':'Reindex'}</button>
      </div>

      {/* chat */}
      <div className="chat-wrap">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {msgs.length === 0 ? (
              <div className="fade-up" style={{ textAlign:'center', paddingTop:40 }}>
                <div style={{ width:60, height:60, borderRadius:18, background:'var(--primary-soft)', color:'var(--primary)', display:'grid', placeItems:'center', margin:'0 auto 16px' }}>{Icons.search({size:28})}</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{lang==='zh'?'问问你的视频知识库':'Ask your video knowledge base'}</div>
                <div className="muted" style={{ marginTop:8, fontSize:14.5 }}>{lang==='zh'?'跨全部笔记做 RAG 对话，答案带可点击的引用来源':'RAG across all your notes — answers cite clickable sources'}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center', marginTop:24 }}>
                  {examples.map((e,i)=><button key={i} className="example-chip" onClick={()=>ask(e)}>{e}</button>)}
                </div>
              </div>
            ) : msgs.map((m,i) => (
              <div key={i} className="msg fade-up">
                <div className={'msg-avatar '+m.role}>{m.role==='ai'?Icons.sparkles({size:18}):Icons.user({size:18})}</div>
                <div className="msg-body">
                  {m.role==='user'
                    ? <div className="bubble-user">{m.text}</div>
                    : <>
                        <div style={{ fontSize:15, lineHeight:1.7 }}>{m.text}</div>
                        {m.sources && (
                          <div className="src-grid">
                            {m.sources.map((s,j)=>{
                              const n = NOTES.find(x=>x.id===s.note);
                              return (
                                <div key={j} className="src-card" onClick={()=>onOpenNote&&onOpenNote()}>
                                  <div className="row" style={{ justifyContent:'space-between', gap:8 }}>
                                    <span style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n?.title[lang]}</span>
                                    <span style={{ color:'var(--faint)', flexShrink:0, display:'grid' }}>{Icons.external({size:14})}</span>
                                  </div>
                                  <div className="row" style={{ gap:7, marginTop:7 }}>
                                    <Pf id={s.platform} sm />
                                    {s.ts && <span className="badge badge-neutral mono" style={{fontSize:11}}>{Icons.play({size:10})} {s.ts}</span>}
                                    {s.sec && <span className="muted" style={{fontSize:12}}>{s.sec}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="composer-wrap">
          <div className="composer">
            <textarea rows={1} value={input} placeholder={lang==='zh'?'输入你的问题，回车发送…':'Ask anything across your notes…'}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); ask(); } }} />
            <button className="btn btn-primary" style={{ height:40, width:40, padding:0, borderRadius:'var(--radius-sm)' }} onClick={()=>ask()}>{Icons.send({size:17})}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { COLLECTIONS, Collections, CollectionDetail, Knowledge });
