/* screens3.jsx — Workspace (note reading), Collections, Knowledge. */
const { useState: useS3, useRef: useR3 } = React;

/* ---------- sample data ---------- */
const NOTES = [
  { id:'n1', platform:'bilibili', title:{zh:'5分钟安装 Claude Code 并接入 DeepSeek', en:'Install Claude Code with DeepSeek in 5 min'}, author:'Yin_Code', style:'tutorial', model:'deepseek-v4-flash', ver:'a5de95', created:'2026-05-28 11:13', status:'SUCCESS' },
  { id:'n2', platform:'bilibili', title:{zh:'别再乱装 Skill 了！这 4 组才是顶级生产力', en:'4 skill groups that actually matter'}, author:'AI 创享派', style:'detailed', model:'gpt-4o-mini', ver:'7c1f02', created:'2026-05-27 21:40', status:'SUCCESS' },
  { id:'n3', platform:'youtube', title:{zh:'What are skills?', en:'What are skills?'}, author:'Anthropic', style:'academic', model:'claude-3.5-sonnet', ver:'33b9aa', created:'2026-05-28 09:02', status:'RUNNING' },
  { id:'n4', platform:'douyin', title:{zh:'住在巴厘岛的数字游民都在做什么工作', en:'What Bali digital nomads do'}, author:'环球漫记', style:'life_journal', model:'deepseek-v4-flash', ver:'10ab5e', created:'2026-05-26 18:55', status:'SUCCESS' },
  { id:'n5', platform:'local', title:{zh:'产品评审会议 · 录屏', en:'Product review · recording'}, author:'本地文件', style:'meeting_minutes', model:'qwen2.5-72b', ver:'9f33c1', created:'2026-05-25 14:20', status:'SUCCESS' },
];

const grad = (id) => {
  const c = (PLATFORMS[id]||{}).color || '#888';
  return `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`;
};

function NoteThumb({ id, className }) {
  return <div className={className} style={{ background: grad(id) }}><span className="ply"/></div>;
}

/* ============ WORKSPACE / READING ============ */
function Workspace({ lang }) {
  const [active, setActive] = useS3('n1');
  const note = NOTES.find(n => n.id === active);
  const styleLabel = (NOTE_STYLES.find(s=>s.value===note.style)||{})[lang];

  return (
    <div className="ws">
      {/* note rail */}
      <div className="note-rail">
        <div className="note-rail-head">
          <button className="btn btn-primary btn-block">{Icons.plus({size:17})} {tr(lang,'newNote')}</button>
          <div className="note-search">{Icons.search({size:16})}<input placeholder={lang==='zh'?'搜索笔记标题…':'Search notes…'} /></div>
        </div>
        <div className="note-list">
          {NOTES.map(n => (
            <div key={n.id} className={'note-card' + (n.id===active?' active':'')} onClick={()=>setActive(n.id)}>
              <NoteThumb id={n.platform} className="note-thumb" />
              <div style={{ minWidth:0, flex:1 }}>
                <div className="note-card-title">{n.title[lang]}</div>
                <div className="note-card-meta">
                  <Pf id={n.platform} sm />
                  <StatusBadge status={n.status} lang={lang} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* reader */}
      <div className="reader">
        <div className="reader-inner fade-up" key={active}>
          {/* meta toolbar */}
          <div className="reader-toolbar">
            <Select width={180} value={'v'} onChange={()=>{}}
              options={[{value:'v', label:(lang==='zh'?'版本':'Version')+' · '+note.ver}]} />
            <span className="badge" style={{ background:'var(--accent-soft)', color:'var(--accent)' }}>{note.model}</span>
            <span className="badge badge-neutral">{styleLabel}</span>
            <span className="field-hint" style={{ marginLeft:'auto' }}>{note.created}</span>
          </div>
          {/* action toolbar */}
          <div className="reader-toolbar">
            <button className="tool-btn">{Icons.mindmap({size:16})} {lang==='zh'?'思维导图':'Mind map'}</button>
            <button className="tool-btn">{Icons.copy({size:16})} {lang==='zh'?'复制':'Copy'}</button>
            <button className="tool-btn">{Icons.download({size:16})} {lang==='zh'?'导出':'Export'} {Icons.chevd({size:14})}</button>
            <button className="tool-btn">{Icons.filetext({size:16})} {lang==='zh'?'原文参照':'Transcript'}</button>
            <button className="tool-btn accent">{Icons.sparkles({size:16})} {lang==='zh'?'AI 问答':'Ask AI'}</button>
          </div>

          {/* video banner */}
          <div className="banner">
            <div className="banner-thumb" style={{ background: grad(note.platform) }}><span className="ply" style={{borderLeftWidth:14,borderTopWidth:9,borderBottomWidth:9}}/></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:15.5, marginBottom:6 }}>{note.title[lang]}</div>
              <div className="row" style={{ gap:8 }}><Pf id={note.platform} sm /><span className="muted" style={{fontSize:13.5}}>{note.author} · {PLATFORMS[note.platform][lang]}</span></div>
            </div>
            <button className="btn btn-outline btn-sm">{Icons.external({size:15})} {lang==='zh'?'原视频':'Source'}</button>
          </div>

          {/* markdown body */}
          {note.status === 'RUNNING'
            ? <div style={{ padding:'30px 0' }}><GenHero stepIndex={2} lang={lang} /><div className="muted" style={{textAlign:'center',marginTop:8}}>{lang==='zh'?'笔记生成中…':'Generating…'}</div></div>
            : <NoteBody lang={lang} note={note} />}
        </div>
      </div>
    </div>
  );
}

function NoteBody({ lang, note }) {
  if (lang === 'en') return (
    <div className="md">
      <h1>{note.title.en}</h1>
      <h2>Overview</h2>
      <p>Claude Code is a command-line tool with built-in Skills plugins that combine to handle complex tasks. This walkthrough shows how to install it on Windows and connect the domestic DeepSeek v4 model.</p>
      <h2>Step 1 · Set up the runtime</h2>
      <ol>
        <li>Search for <code>node js</code> in your browser and open the official site.</li>
        <li>Click “Get Node.js”, pick the <strong>Windows installer</strong>, then install with defaults.</li>
        <li>Verify: press Win, search <code>CMD</code>, run as admin and enter <code>node -v</code>.</li>
      </ol>
      <blockquote>Tip — install to a path with no spaces or non-ASCII characters, or the sidecar may fail to launch.</blockquote>
      <h2>Step 2 · Connect DeepSeek</h2>
      <p>Open Settings → AI models, add a provider, paste your API key and enable <code>deepseek-v4</code>. Jump to <span className="ts">04:12</span> in the source for the exact dialog.</p>
    </div>
  );
  return (
    <div className="md">
      <h1>{note.title.zh}</h1>
      <h2>概述</h2>
      <p>Claude Code 是一款命令行工具，内置多种 Skills 插件，可通过组合完成复杂任务（如自动整理笔记、搜集行业资讯并发布到社交媒体）。本教程演示如何在 Windows 上安装并接入国产大模型 DeepSeek v4。</p>
      <h2>第一步 · 安装运行环境</h2>
      <ol>
        <li>打开浏览器搜索 <code>node js</code>，进入官网。</li>
        <li>点击「获取 Node.js」，下滑选择左侧 <strong>Windows 安装程序</strong>，下载并双击安装，一路「下一步」。</li>
        <li>验证安装：按 Win 键搜索 <code>CMD</code>，右键以管理员身份运行，输入 <code>node -v</code> 回车。</li>
      </ol>
      <blockquote>提示 —— 请安装到没有中文、没有空格的路径，否则 sidecar 启动会失败。</blockquote>
      <h2>第二步 · 接入 DeepSeek</h2>
      <p>打开 设置 → AI 模型设置，新建供应商，填入 API Key 并启用 <code>deepseek-v4</code>。可跳转到原片 <span className="ts">04:12</span> 查看具体弹窗。</p>
    </div>
  );
}

Object.assign(window, { NOTES, grad, NoteThumb, Workspace, NoteBody });
