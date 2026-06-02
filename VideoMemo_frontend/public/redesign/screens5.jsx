/* screens5.jsx — Guide (使用说明) + Settings (设置: 模型 / 转写 / 下载 / 监控 / 关于). */
const { useState: useS5, useEffect: useE5 } = React;

/* ============ GUIDE ============ */
function Guide({ lang, onNav }) {
  const steps = [
    { icon:'bot', to:'set:model', zh:{t:'配置 AI 模型', d:'生成笔记需要先连一个大模型供应商（DeepSeek、OpenAI 兼容、本地都支持）。', tip:'在「设置 → AI 模型设置」新建供应商，填好 API Key，启用要用的模型。', cta:'去配置'},
      en:{t:'Connect an AI model', d:'You need an LLM provider first — DeepSeek, OpenAI-compatible, or local all work.', tip:'Settings → AI models → add a provider, paste your API key, enable a model.', cta:'Configure'} },
    { icon:'waveform', to:'set:transcriber', zh:{t:'准备音频转写器', d:'没有字幕的视频要把音频转成文字。Apple Silicon 推荐 mlx-whisper，通用环境用 fast-whisper。', tip:'在「音频转写配置」选引擎并下载模型（tiny / base 几十 MB，large-v3-turbo 质量最高）。', cta:'去配置'},
      en:{t:'Set up transcription', d:'Videos without captions need audio→text. mlx-whisper for Apple Silicon, fast-whisper elsewhere.', tip:'Pick an engine and download a model (tiny/base are tiny; large-v3-turbo is best).', cta:'Configure'} },
    { icon:'download', to:'set:download', zh:{t:'配置平台 Cookie（按需）', d:'部分视频需要登录态。YouTube 推荐从浏览器实时读取 Cookie，避免风控轮换作废。', tip:'在「下载配置 → 对应平台」粘贴 Cookie 或选择浏览器。', cta:'去配置'},
      en:{t:'Platform cookies (optional)', d:'Some videos need a logged-in session. For YouTube, read cookies live from your browser.', tip:'Downloader → pick a platform → paste a cookie or choose a browser.', cta:'Configure'} },
    { icon:'plus', to:'newnote', zh:{t:'新建一篇笔记', d:'回工作区点「+ 新建笔记」，粘贴视频链接，平台自动识别，选好模型与风格即可。', tip:'勾选要包含的内容（目录 / 原片跳转 / 截图），点「生成笔记」。', cta:'去工作区'},
      en:{t:'Create your first note', d:'Hit “+ New note”, paste a link (platform auto-detected), pick a model and style.', tip:'Choose what to include (outline / timestamps / screenshots), then Generate.', cta:'Open workspace'} },
    { icon:'tasks', to:'tasks', zh:{t:'看进度 / 暂停继续', d:'进度条显示「解析 → 下载 → 转写 → 总结 → 完成」五步，前三步可暂停。', tip:'想看所有任务的状态与 Token 消耗，去「任务列表」。', cta:'查看任务'},
      en:{t:'Track & pause', d:'The bar shows Parse → Download → Transcribe → Summarize → Done; pause in the first three.', tip:'See every job’s status and token usage in Tasks.', cta:'View tasks'} },
    { icon:'library', to:'collections', zh:{t:'整理与导出', d:'把相关笔记建成「分类合集」，可生成闪卡复习、下载 ZIP、推送 Drive。', tip:'批量导入页支持多链接同时生成，适合批量积累。', cta:'打开合集'},
      en:{t:'Organize & export', d:'Group notes into collections — make flashcards, download ZIP, push to Drive.', tip:'Batch import generates many links at once.', cta:'Open collections'} },
  ];
  return (
    <div className="content-inner narrow fade-up">
      <ol style={{ listStyle:'none', margin:0, padding:'0 0 0 36px', position:'relative', borderLeft:'2px solid var(--border)' }}>
        {steps.map((s, i) => {
          const c = s[lang];
          return (
            <li key={i} style={{ marginBottom:18, position:'relative' }}>
              <span style={{ position:'absolute', left:-53, top:0, width:34, height:34, borderRadius:999, background:'var(--primary)', color:'var(--primary-fg)', display:'grid', placeItems:'center', fontWeight:800, fontSize:14, boxShadow:'var(--shadow-sm)' }}>{i+1}</span>
              <div className="card card-pad">
                <div className="row" style={{ gap:11, marginBottom:8 }}>
                  <span style={{ width:34, height:34, borderRadius:10, background:'var(--primary-soft)', color:'var(--primary)', display:'grid', placeItems:'center' }}>{Icons[s.icon]({size:18})}</span>
                  <span style={{ fontSize:16.5, fontWeight:800 }}>{c.t}</span>
                </div>
                <p className="muted" style={{ margin:'0 0 8px', fontSize:14, lineHeight:1.6 }}>{c.d}</p>
                <p className="faint" style={{ margin:0, fontSize:12.5, lineHeight:1.55 }}><b style={{color:'var(--muted)'}}>{lang==='zh'?'提示：':'Tip: '}</b>{c.tip}</p>
                <button className="link" style={{ marginTop:12, display:'inline-flex', alignItems:'center', gap:5, border:'none', background:'none', cursor:'pointer', font:'inherit', fontWeight:700 }} onClick={()=>onNav(s.to)}>{c.cta} {Icons.arrowr({size:15})}</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="card card-pad" style={{ marginTop:8, textAlign:'center', background:'var(--primary-soft)', borderColor:'color-mix(in srgb, var(--primary) 25%, transparent)' }}>
        <div style={{ color:'var(--primary)', display:'grid', placeItems:'center', marginBottom:8 }}>{Icons.checkc({size:30})}</div>
        <div style={{ fontWeight:800, fontSize:17 }}>{lang==='zh'?'就这么多，开始创建第一篇笔记吧':'That’s it — go make your first note'}</div>
        <button className="btn btn-primary" style={{ margin:'16px auto 0' }} onClick={()=>onNav('newnote')}>{Icons.plus({size:17})} {tr(lang,'newNote')}</button>
      </div>
    </div>
  );
}

/* ============ SETTINGS ============ */
function Settings({ lang, sub }) {
  if (sub === 'transcriber') return <TranscriberPanel lang={lang} />;
  if (sub === 'download') return <DownloadPanel lang={lang} />;
  if (sub === 'monitor') return <MonitorPanel lang={lang} />;
  if (sub === 'about') return <AboutPanel lang={lang} />;
  return <ModelPanel lang={lang} />;
}

const SettingHead = ({ title, sub }) => (
  <div style={{ marginBottom:22 }}>
    <div style={{ fontSize:20, fontWeight:800 }}>{title}</div>
    <div className="muted" style={{ fontSize:13.5, marginTop:3 }}>{sub}</div>
  </div>
);

function ModelPanel({ lang }) {
  const [providers, setProviders] = useS5([
    { id:'p1', name:'DeepSeek', base:'https://api.deepseek.com', type:'openai', key:'sk-••••••••••••3f9a', enabled:true, models:['deepseek-v4-flash','deepseek-v4'], builtin:true },
    { id:'p2', name:'OpenAI', base:'https://api.openai.com/v1', type:'openai', key:'sk-••••••••••••a12c', enabled:true, models:['gpt-4o','gpt-4o-mini'], builtin:true },
    { id:'p3', name:'本地 · Ollama', base:'http://localhost:11434/v1', type:'openai', key:'', enabled:false, models:['qwen2.5-72b'], builtin:false },
  ]);
  const [sel, setSel] = useS5('p1');
  const [addModel, setAddModel] = useS5('');
  const cur = providers.find(p => p.id === sel);

  const patch = (id, fields) => setProviders(ps => ps.map(p => p.id===id ? {...p, ...fields} : p));
  const removeModel = (m) => patch(sel, { models: cur.models.filter(x=>x!==m) });
  const candidates = ['deepseek-r1','gpt-4.1','o3-mini','claude-3.5-haiku','qwen2.5-7b'].filter(c=>!cur.models.includes(c));
  const doAdd = () => { if(addModel){ patch(sel, { models:[...cur.models, addModel] }); setAddModel(''); } };

  const L = (zh,en) => lang==='zh'?zh:en;

  return (
    <div className="content-inner wide fade-up">
      <SettingHead title={L('AI 模型设置','AI models')} sub={L('连接大模型供应商，左侧选择，右侧编辑并启用模型','Pick a provider on the left, edit and enable models on the right')} />
      <div className="card" style={{ display:'grid', gridTemplateColumns:'280px 1fr', overflow:'hidden', minHeight:560 }}>
        {/* left: provider list */}
        <div style={{ borderRight:'1px solid var(--border)', background:'var(--surface-2)', padding:16, display:'flex', flexDirection:'column', gap:12 }}>
          <button className="btn btn-primary btn-block">{Icons.plus({size:16})} {L('添加模型供应商','Add provider')}</button>
          <div className="filter-group-label" style={{ margin:0 }}>{L('模型供应商列表','Providers')}</div>
          <div className="col" style={{ gap:6 }}>
            {providers.map(p => (
              <div key={p.id} onClick={()=>setSel(p.id)}
                className="row" style={{ gap:10, height:54, padding:'0 12px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                  border:'1px solid '+(sel===p.id?'color-mix(in srgb,var(--primary) 35%,transparent)':'transparent'),
                  background: sel===p.id?'var(--primary-soft)':'transparent' }}>
                <span style={{ width:32, height:32, borderRadius:9, flexShrink:0, background:'var(--surface-3)', color:'var(--muted)', display:'grid', placeItems:'center' }}>{Icons.bot({size:17})}</span>
                <span style={{ flex:1, minWidth:0, fontWeight:700, fontSize:14, color: sel===p.id?'var(--primary-strong)':'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                <span onClick={e=>e.stopPropagation()}><Toggle on={p.enabled} onClick={()=>patch(p.id,{enabled:!p.enabled})} /></span>
              </div>
            ))}
          </div>
        </div>

        {/* right: provider detail */}
        <div style={{ background:'var(--surface)' }}>
          <div className="fade-up" key={sel} style={{ maxWidth:620, padding:'24px 30px 40px', display:'flex', flexDirection:'column', gap:24 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:800, marginBottom:4 }}>{L('编辑模型供应商','Edit provider')}</div>
              {!cur.builtin && <div style={{ fontSize:12.5, color:'var(--danger)', fontStyle:'italic' }}>{L('自定义供应商需兼容 OpenAI SDK','Custom providers must be OpenAI-SDK compatible')}</div>}
            </div>

            <div className="col" style={{ gap:14 }}>
              <FormRow label={L('名称','Name')}>
                <input className="input" value={cur.name} disabled={cur.builtin} onChange={e=>patch(sel,{name:e.target.value})} />
              </FormRow>
              <FormRow label="API Key">
                <input className="input input-mono" value={cur.key} placeholder="sk-..." onChange={e=>patch(sel,{key:e.target.value})} />
              </FormRow>
              <FormRow label={L('API 地址','API URL')}>
                <div className="row" style={{ gap:8 }}>
                  <input className="input input-mono grow" style={{ minWidth:0 }} value={cur.base} onChange={e=>patch(sel,{base:e.target.value})} />
                  <button className="btn btn-ghost btn-sm" style={{ flexShrink:0 }}>{L('测试连通性','Test')}</button>
                </div>
              </FormRow>
              <FormRow label={L('类型','Type')}>
                <input className="input input-mono" value={cur.type} disabled />
              </FormRow>
              <div style={{ paddingLeft:104 }}>
                <button className="btn btn-primary btn-sm">{Icons.check({size:15})} {L('保存修改','Save')}</button>
              </div>
            </div>

            <div className="divider" style={{ margin:0 }} />

            {/* models */}
            <div className="col" style={{ gap:12 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>{L('模型列表','Models')}</div>
              <div style={{ background:'var(--danger-soft)', color:'var(--danger)', borderRadius:'var(--radius-sm)', padding:'10px 13px', fontSize:13 }}>
                <b>{L('注意！','Heads up!')}</b> {L('请确保已保存供应商信息并通过连通性测试。','Save the provider info and pass the connectivity test first.')}
              </div>
              <div className="row" style={{ gap:8 }}>
                <div className="grow" style={{ minWidth:0 }}>
                  <Select value={addModel} onChange={setAddModel} placeholder={L('选择要添加的模型','Pick a model to add')}
                    options={candidates.map(c=>({value:c,label:c}))} />
                </div>
                <button className="btn btn-outline btn-sm" style={{ flexShrink:0 }} onClick={doAdd} disabled={!addModel}>{Icons.plus({size:15})} {L('添加','Add')}</button>
                <button className="icon-btn" title={L('刷新','Refresh')}>{Icons.refresh({size:16})}</button>
              </div>

              <div style={{ fontWeight:800, fontSize:14, marginTop:4 }}>{L('已启用模型','Enabled models')}</div>
              <div className="chip-row">
                {cur.models.length===0 && <span className="faint" style={{fontSize:13}}>{L('暂无，请从上方添加','None yet — add one above')}</span>}
                {cur.models.map(m => (
                  <span key={m} className="badge" style={{ background:'var(--primary-soft)', color:'var(--primary-strong)', padding:'6px 8px 6px 12px', fontFamily:'var(--font-mono)', fontSize:12.5 }}>
                    {m}
                    <button onClick={()=>removeModel(m)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', display:'grid', padding:0, marginLeft:2 }}>{Icons.x({size:13})}</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="row" style={{ gap:12, alignItems:'center' }}>
      <label style={{ width:92, textAlign:'right', flexShrink:0, fontSize:13.5, fontWeight:600, color:'var(--muted)' }}>{label}</label>
      <div style={{ flex:1, minWidth:0 }}>{children}</div>
    </div>
  );
}

function TranscriberPanel({ lang }) {
  const [engine, setEngine] = useS5('mlx');
  const [size, setSize] = useS5('large-v3-turbo');
  const sizes = [
    { v:'tiny', mb:'75 MB', dl:true }, { v:'base', mb:'140 MB', dl:true },
    { v:'small', mb:'460 MB', dl:false }, { v:'medium', mb:'1.5 GB', dl:false },
    { v:'large-v3-turbo', mb:'1.6 GB', dl:true },
  ];
  return (
    <div className="content-inner narrow fade-up">
      <SettingHead title={lang==='zh'?'音频转写配置':'Transcription'} sub={lang==='zh'?'选择把音频转成文字的引擎，保存后对新任务生效':'Pick the audio→text engine; applies to new jobs'} />
      <div className="card card-pad" style={{ marginBottom:16 }}>
        <Field label={lang==='zh'?'转写引擎':'Engine'}>
          <Segmented value={engine} onChange={setEngine} options={[
            {value:'mlx', label:'mlx-whisper'}, {value:'fast', label:'fast-whisper'}, {value:'groq', label:'Groq · 在线'},
          ]} />
        </Field>
        {engine==='mlx' && <div className="badge badge-ok" style={{ borderRadius:'var(--radius-sm)', padding:'9px 13px' }}>{Icons.checkc({size:15})} {lang==='zh'?'检测到 Apple Silicon，推荐使用 mlx-whisper':'Apple Silicon detected — mlx-whisper recommended'}</div>}
      </div>
      <div className="card card-pad">
        <Field label={lang==='zh'?'模型档位':'Model size'} en={lang==='zh'?'Model':'档位'}>
          <div className="col" style={{ gap:8 }}>
            {sizes.map(s => (
              <div key={s.v} onClick={()=>setSize(s.v)} className="row" style={{ justifyContent:'space-between', padding:'11px 13px', borderRadius:'var(--radius-sm)', cursor:'pointer', border:'1px solid '+(size===s.v?'var(--primary)':'var(--border)'), background: size===s.v?'var(--primary-soft)':'var(--surface)' }}>
                <div className="row" style={{ gap:10 }}>
                  <span style={{ width:16, height:16, borderRadius:999, border:'2px solid '+(size===s.v?'var(--primary)':'var(--border-strong)'), display:'grid', placeItems:'center' }}>{size===s.v && <span style={{width:7,height:7,borderRadius:999,background:'var(--primary)'}}/>}</span>
                  <span className="mono" style={{ fontSize:13.5, fontWeight:600 }}>{s.v}</span>
                  <span className="faint" style={{ fontSize:12 }}>{s.mb}</span>
                </div>
                {s.dl
                  ? <span className="badge badge-ok">{Icons.checkc({size:13})} {lang==='zh'?'已下载':'Ready'}</span>
                  : <button className="btn btn-outline btn-sm" onClick={e=>e.stopPropagation()}>{Icons.download({size:14})} {lang==='zh'?'下载':'Download'}</button>}
              </div>
            ))}
          </div>
        </Field>
        <button className="btn btn-primary" style={{ marginTop:6 }}>{Icons.check({size:16})} {lang==='zh'?'保存配置':'Save'}</button>
      </div>
    </div>
  );
}

function DownloadPanel({ lang }) {
  const rows = [
    { id:'bilibili', mode:'cookie', filled:true }, { id:'youtube', mode:'browser', filled:true },
    { id:'douyin', mode:'cookie', filled:false }, { id:'kuaishou', mode:'cookie', filled:false },
  ];
  return (
    <div className="content-inner narrow fade-up">
      <SettingHead title={lang==='zh'?'下载配置':'Downloader'} sub={lang==='zh'?'为需要登录态的平台配置 Cookie 或浏览器读取':'Configure cookies / browser reading for gated platforms'} />
      <div className="card" style={{ overflow:'hidden' }}>
        {rows.map((r,i)=>(
          <div key={r.id} className="row" style={{ gap:13, padding:'15px 18px', borderBottom: i<rows.length-1?'1px solid var(--border)':'none' }}>
            <Pf id={r.id} />
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700 }}>{PLATFORMS[r.id][lang]}</div>
              <div className="faint" style={{ fontSize:12.5 }}>{r.mode==='browser'?(lang==='zh'?'从浏览器实时读取':'Read from browser'):(lang==='zh'?'手动粘贴 Cookie':'Paste cookie manually')}</div>
            </div>
            {r.filled
              ? <span className="badge badge-ok">{Icons.checkc({size:13})} {lang==='zh'?'已配置':'Set'}</span>
              : <span className="badge badge-neutral">{lang==='zh'?'未配置':'Empty'}</span>}
            <button className="btn btn-outline btn-sm">{Icons.pencil({size:14})} {lang==='zh'?'编辑':'Edit'}</button>
          </div>
        ))}
      </div>
      <div className="badge badge-warn" style={{ marginTop:14, borderRadius:'var(--radius-sm)', padding:'10px 14px' }}>
        {Icons.bot({size:15})} {lang==='zh'?'YouTube 强烈推荐「从浏览器读取」，避免会话被风控轮换作废':'For YouTube, prefer “read from browser” to avoid session rotation'}
      </div>
    </div>
  );
}

function MonitorPanel({ lang }) {
  const stats = [
    { icon:'cpu', label:{zh:'后端服务',en:'Backend'}, val:'8483', ok:true, note:{zh:'运行中',en:'Running'} },
    { icon:'waveform', label:{zh:'转写引擎',en:'Transcriber'}, val:'mlx · large-v3-turbo', ok:true, note:{zh:'已就绪',en:'Ready'} },
    { icon:'download', label:{zh:'下载器 yt-dlp',en:'Downloader'}, val:'2025.05.20', ok:true, note:{zh:'最新',en:'Latest'} },
    { icon:'bot', label:{zh:'向量索引',en:'Vector index'}, val:'128 docs', ok:true, note:{zh:'已同步',en:'Synced'} },
  ];
  return (
    <div className="content-inner narrow fade-up">
      <SettingHead title={lang==='zh'?'部署监控':'System'} sub={lang==='zh'?'各核心服务的运行状态':'Live status of core services'} />
      <div className="grid-2">
        {stats.map((s,i)=>(
          <div key={i} className="card card-pad">
            <div className="row" style={{ justifyContent:'space-between' }}>
              <span style={{ width:36, height:36, borderRadius:10, background:'var(--primary-soft)', color:'var(--primary)', display:'grid', placeItems:'center' }}>{Icons[s.icon]({size:18})}</span>
              <span className="badge badge-ok"><span className="dot"/>{s.note[lang]}</span>
            </div>
            <div className="muted" style={{ fontSize:13, marginTop:14 }}>{s.label[lang]}</div>
            <div className="mono" style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutPanel({ lang }) {
  const feats = [
    { icon:'layers', zh:['多平台 + 自定义','内建 6 大平台，可登记任意 yt-dlp 平台并存 Cookie。'], en:['Multi-platform','6 built-in platforms; register any yt-dlp site with cookies.'] },
    { icon:'sparkles', zh:['AI 笔记生成','9 种风格，可选目录、原片跳转、关键画面截图。'], en:['AI notes','9 styles, optional outline, timestamps and key-frame shots.'] },
    { icon:'waveform', zh:['音频转写','优先用平台字幕，无字幕时本地 Whisper 转写。'], en:['Transcription','Use platform captions first, local Whisper otherwise.'] },
    { icon:'tasks', zh:['任务 + Token 统计','记录每个任务的平台、模型、状态与 Token 消耗。'], en:['Tasks + tokens','Track platform, model, status and token cost per job.'] },
    { icon:'library', zh:['合集 + 闪卡','归类笔记，一键生成问答闪卡，导出 ZIP / Drive。'], en:['Collections + cards','Group notes, auto flashcards, export ZIP / Drive.'] },
    { icon:'search', zh:['跨笔记知识库','对全库做 RAG 对话，答案带可点击引用来源。'], en:['Knowledge base','RAG across all notes with clickable source citations.'] },
  ];
  return (
    <div className="content-inner wide fade-up">
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:14, marginBottom:14 }}>
          <BrandMark size={52} />
          <span style={{ fontSize:34, fontWeight:800, letterSpacing:'-.02em' }}>VideoMemo</span>
          <span className="badge badge-neutral" style={{ fontSize:13 }}>v2.3.4</span>
        </div>
        <p className="muted" style={{ fontSize:16, maxWidth:540, margin:'0 auto 20px', lineHeight:1.6 }}>{lang==='zh'?'把视频变成结构化的 AI 笔记 —— 开源、可扩展、可桌面化的视频备忘工具。':'Turn videos into structured AI notes — an open-source, extensible, desktop-ready memo tool.'}</p>
        <div className="row" style={{ gap:8, justifyContent:'center', flexWrap:'wrap', marginBottom:18 }}>
          {['Apache 2.0','React 19','FastAPI','yt-dlp','Whisper','Tauri'].map(b=><span key={b} className="badge badge-neutral">{b}</span>)}
        </div>
        <div className="row" style={{ gap:10, justifyContent:'center' }}>
          <button className="btn btn-primary">{Icons.github({size:17})} GitHub</button>
          <button className="btn btn-outline">{Icons.download({size:16})} {lang==='zh'?'下载桌面版':'Desktop app'}</button>
          <button className="btn btn-outline">{Icons.star({size:16})} Star</button>
        </div>
      </div>
      <div style={{ fontSize:18, fontWeight:800, marginBottom:14 }}>{lang==='zh'?'功能特性':'Features'}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:14, marginBottom:36 }}>
        {feats.map((f,i)=>{ const c=f[lang]; return (
          <div key={i} className="card card-pad">
            <span style={{ width:38, height:38, borderRadius:10, background:'var(--primary-soft)', color:'var(--primary)', display:'grid', placeItems:'center', marginBottom:11 }}>{Icons[f.icon]({size:19})}</span>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:5 }}>{c[0]}</div>
            <div className="muted" style={{ fontSize:13.5, lineHeight:1.6 }}>{c[1]}</div>
          </div>
        );})}
      </div>
      <div className="card card-pad" style={{ textAlign:'center', background:'var(--primary-soft)', borderColor:'color-mix(in srgb, var(--primary) 22%, transparent)' }}>
        <div style={{ color:'var(--primary)', display:'grid', placeItems:'center', marginBottom:8 }}>{Icons.cloud({size:26})}</div>
        <div className="muted" style={{ fontSize:14 }}>{lang==='zh'?'欢迎 PR / Issue / Star，任何建议都可以在仓库交流。':'PRs, issues and stars welcome — let’s talk in the repo.'}</div>
        <div className="faint" style={{ fontSize:12, marginTop:8 }}>VideoMemo · Apache 2.0 · 2026</div>
      </div>
    </div>
  );
}

Object.assign(window, { Guide, Settings });
