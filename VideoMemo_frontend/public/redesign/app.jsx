/* app.jsx — shell, routing, language + theme tweaks, mount. */
const { useState: useSA, useEffect: useEA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "warm",
  "lang": "zh",
  "fontScale": 100,
  "showNavEn": true,
  "accent": "default"
}/*EDITMODE-END*/;

const THEME_DOTS = {
  warm:  ['#D2682F', '#2F8068', '#F7F1E7'],
  slate: ['#4B45E0', '#0E9FD6', '#F6F7F9'],
  sage:  ['#2F8F6B', '#C2823A', '#EFF3EF'],
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = useSA('newnote'); // newnote | batch | tasks | <navId>
  const lang = t.lang;

  useEA(() => {
    document.body.setAttribute('data-switching', '');
    document.body.setAttribute('data-theme', t.theme);
    document.documentElement.style.fontSize = (16 * t.fontScale / 100) + 'px';
    const id = setTimeout(() => document.body.removeAttribute('data-switching'), 60);
    return () => clearTimeout(id);
  }, [t.theme, t.fontScale]);

  useEA(() => {
    const b = document.getElementById('boot');
    if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 350); }
  }, []);

  const navItems = NAV;
  const activeNav = (page === 'newnote') ? 'workspace' : page;

  const pageMeta = {
    workspace: { zh:'工作区', en:'Workspace', sub: lang==='zh'?'阅读、导出与追问你的视频笔记':'Read, export and ask about your notes' },
    newnote: { zh:'新建笔记', en:'New note', sub: tr(lang,'newNoteSub') },
    batch:   { zh: tr(lang,'batch'), en: tr(lang,'batch'), sub: tr(lang,'batchSub') },
    tasks:   { zh: tr(lang,'tasks'), en: tr(lang,'tasks'), sub: tr(lang,'tasksSub') },
    collections: { zh:'分类合集', en:'Collections', sub: lang==='zh'?'把相关笔记归类，闪卡复习与一键导出':'Group notes, review with flashcards, export' },
    knowledge: { zh:'知识检索', en:'Knowledge', sub: lang==='zh'?'跨全部笔记做 RAG 对话，答案带引用来源':'RAG across all notes with cited sources' },
    guide: { zh:'使用说明', en:'Guide', sub: lang==='zh'?'从零到生成第一篇笔记，跟着 6 步走':'Six steps from zero to your first note' },
    'set:model': { zh:'设置', en:'Settings', sub: lang==='zh'?'AI 模型设置':'AI models' },
    'set:transcriber': { zh:'设置', en:'Settings', sub: lang==='zh'?'音频转写配置':'Transcription' },
    'set:download': { zh:'设置', en:'Settings', sub: lang==='zh'?'下载配置':'Downloader' },
    'set:monitor': { zh:'设置', en:'Settings', sub: lang==='zh'?'部署监控':'System' },
    'set:about': { zh:'设置', en:'Settings', sub: lang==='zh'?'关于':'About' },
  };
  const meta = pageMeta[page] || (NAV.find(n=>n.id===page) ? { zh: NAV.find(n=>n.id===page).zh, en: NAV.find(n=>n.id===page).en, sub:'' } : pageMeta.newnote);

  const fullBleed = page === 'workspace' || page === 'knowledge';

  const renderPage = () => {
    if (page === 'workspace') return <Workspace lang={lang} onNew={()=>setPage('newnote')} />;
    if (page === 'newnote') return <NewNote lang={lang} onGoTasks={()=>setPage('tasks')} />;
    if (page === 'batch')   return <BatchImport lang={lang} onGoTasks={()=>setPage('tasks')} />;
    if (page === 'tasks')   return <TaskList lang={lang} onNew={()=>setPage('newnote')} />;
    if (page === 'collections') return <Collections lang={lang} />;
    if (page === 'knowledge')   return <Knowledge lang={lang} onOpenNote={()=>setPage('workspace')} />;
    if (page === 'guide')       return <Guide lang={lang} onNav={setPage} />;
    if (page.indexOf('set:') === 0) return <Settings lang={lang} sub={page.slice(4)} />;
    const item = NAV.find(n=>n.id===page);
    return <GenericPage lang={lang} item={item || NAV[0]} />;
  };

  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">VideoMemo</div>
            <div className="brand-sub">AI VIDEO NOTES</div>
          </div>
        </div>

        <button className="btn btn-primary btn-block" style={{ margin:'2px 4px 8px', width:'calc(100% - 8px)' }} onClick={()=>setPage('newnote')}>
          {Icons.plus({size:18})} {tr(lang,'newNote')}
        </button>

        <div className="nav-group-label">{lang==='zh'?'工作台':'Workspace'}</div>
        {navItems.map(n => (
          <button key={n.id} className={'nav-item' + (activeNav===n.id ? ' active':'')}
            onClick={()=>setPage(n.id)}>
            <span className="nav-ico">{Icons[n.icon]({size:19})}</span>
            <span>{n[lang]}</span>
            {t.showNavEn && <span className="nav-en">{lang==='zh'?n.en:n.zh}</span>}
          </button>
        ))}

        <div className="nav-group-label">{lang==='zh'?'设置':'Settings'}</div>
        {[
          { id:'set:model', icon:'bot', zh:'AI 模型', en:'AI models' },
          { id:'set:transcriber', icon:'waveform', zh:'音频转写', en:'Transcriber' },
          { id:'set:download', icon:'sliders', zh:'下载配置', en:'Downloader' },
          { id:'set:monitor', icon:'cpu', zh:'部署监控', en:'System' },
          { id:'set:about', icon:'info', zh:'关于', en:'About' },
        ].map(s => (
          <button key={s.id} className={'nav-item' + (page===s.id?' active':'')} onClick={()=>setPage(s.id)}>
            <span className="nav-ico">{(Icons[s.icon]||Icons.bot)({size:19})}</span>
            <span>{lang==='zh'?s.zh:s.en}</span>
            {t.showNavEn && <span className="nav-en">{lang==='zh'?s.en:s.zh}</span>}
          </button>
        ))}

        <div className="sidebar-foot">
          <div className="usage-card">
            <div className="usage-row"><span>{tr(lang,'usage')}</span><span className="usage-num">128</span></div>
            <div className="usage-row" style={{marginTop:2}}><span className="faint" style={{fontSize:11}}>{lang==='zh'?'已生成 · 篇笔记':'notes generated'}</span></div>
            <div className="usage-bar"><i style={{ width:'64%' }}/></div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        <header className="topbar">
          <div>
            <div className="page-title">{meta[lang]}</div>
            <div className="page-sub">{meta.sub}</div>
          </div>
          <div className="topbar-actions">
            {page==='newnote' && <button className="btn btn-outline btn-sm" onClick={()=>setPage('batch')}>{Icons.stack({size:16})} {tr(lang,'batch')}</button>}
            <div className="seg">
              <button className={'seg-item'+(lang==='zh'?' active':'')} onClick={()=>setTweak('lang','zh')}>中文</button>
              <button className={'seg-item'+(lang==='en'?' active':'')} onClick={()=>setTweak('lang','en')}>EN</button>
            </div>
          </div>
        </header>
        <div className="content" style={fullBleed ? { overflow:'hidden', display:'flex', flexDirection:'column' } : null}>{renderPage()}</div>
      </div>

      {/* TWEAKS */}
      <TweaksPanel>
        <TweakSection label={lang==='zh'?'视觉方向 Visual direction':'Visual direction'} />
        <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'2px 0 6px' }}>
          {THEMES.map(th => (
            <button key={th.id} onClick={()=>setTweak('theme', th.id)}
              style={{
                display:'flex', alignItems:'center', gap:11, padding:'10px 12px', cursor:'pointer', textAlign:'left',
                borderRadius:10, border:'1px solid ' + (t.theme===th.id?'var(--primary)':'var(--border)'),
                background: t.theme===th.id?'var(--primary-soft)':'var(--surface)', color:'var(--text)',
              }}>
              <span style={{ display:'flex', gap:3 }}>
                {THEME_DOTS[th.id].map((c,i)=><span key={i} style={{ width:14, height:14, borderRadius:999, background:c, border:'1px solid rgba(0,0,0,.08)' }}/>)}
              </span>
              <span style={{ lineHeight:1.25 }}>
                <span style={{ display:'block', fontWeight:800, fontSize:13.5 }}>{th.zh} · {th.en}</span>
                <span style={{ display:'block', fontSize:11.5, color:'var(--muted)' }}>{th.desc[lang]}</span>
              </span>
              {t.theme===th.id && <span style={{ marginLeft:'auto', color:'var(--primary)', display:'grid' }}>{Icons.check({size:17})}</span>}
            </button>
          ))}
        </div>
        <TweakSection label={lang==='zh'?'界面 Interface':'Interface'} />
        <TweakRadio label={lang==='zh'?'语言':'Language'} value={lang} options={[{value:'zh',label:'中文'},{value:'en',label:'EN'}]} onChange={(v)=>setTweak('lang',v)} />
        <TweakSlider label={lang==='zh'?'字号':'Font scale'} value={t.fontScale} min={90} max={115} step={5} unit="%" onChange={(v)=>setTweak('fontScale',v)} />
        <TweakToggle label={lang==='zh'?'侧栏显示双语':'Bilingual sidebar'} value={t.showNavEn} onChange={(v)=>setTweak('showNavEn',v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
