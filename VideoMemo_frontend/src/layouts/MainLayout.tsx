import { FC, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutGrid,
  Library,
  Search,
  ListTodo,
  FileStack,
  BookOpen,
  BotMessageSquare,
  AudioWaveform,
  HardDriveDownload,
  Activity,
  Info,
  Plus,
  Palette,
  Flame,
  KeyRound,
  Send,
  Newspaper,
  Radio,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { BrandMark } from '@/components/design/BrandMark'
import { trVm, useVmLang, VM_STRINGS } from '@/i18n/redesign'
import { useThemeStore, VM_THEMES, VmTheme } from '@/store/themeStore'
import { useTaskStore } from '@/store/taskStore'

type NavItem = {
  id: string
  path: string
  icon: JSX.Element
  zhKey: keyof typeof VM_STRINGS
}

const workspaceNav: NavItem[] = [
  { id: 'workspace', path: '/', icon: <LayoutGrid />, zhKey: 'workspace' },
  { id: 'articles', path: '/articles', icon: <Newspaper />, zhKey: 'articles' },
  { id: 'collections', path: '/collections', icon: <Library />, zhKey: 'collections' },
  { id: 'knowledge', path: '/knowledge', icon: <Search />, zhKey: 'knowledge' },
  { id: 'tasks', path: '/tasks', icon: <ListTodo />, zhKey: 'tasks' },
  { id: 'batch', path: '/batch-import', icon: <FileStack />, zhKey: 'batch' },
]

const hotNav: NavItem[] = [
  { id: 'trends', path: '/trends', icon: <Radio />, zhKey: 'trendRadar' },
  { id: 'subscriptions', path: '/subscriptions', icon: <Bell />, zhKey: 'subscriptions' },
]

const guideNav: NavItem[] = [
  { id: 'guide', path: '/guide', icon: <BookOpen />, zhKey: 'guide' },
]

const settingsNav: NavItem[] = [
  { id: 'models', path: '/settings/model', icon: <BotMessageSquare />, zhKey: 'aiModels' },
  {
    id: 'transcriber',
    path: '/settings/transcriber',
    icon: <AudioWaveform />,
    zhKey: 'transcriber',
  },
  {
    id: 'downloader',
    path: '/settings/download',
    icon: <HardDriveDownload />,
    zhKey: 'downloader',
  },
  {
    id: 'feishu',
    path: '/settings/feishu',
    icon: <Send />,
    zhKey: 'feishu',
  },
  {
    id: 'access-password',
    path: '/settings/access-password',
    icon: <KeyRound />,
    zhKey: 'accessPassword',
  },
  { id: 'monitor', path: '/settings/monitor', icon: <Activity />, zhKey: 'monitor' },
  { id: 'about', path: '/settings/about', icon: <Info />, zhKey: 'about' },
]

const pageMeta: Record<string, { titleKey: string; subKey: string }> = {
  '/': { titleKey: 'workspace', subKey: 'newNoteSub' },
  '/articles': { titleKey: 'articles', subKey: 'articlesSub' },
  '/trends': { titleKey: 'trendRadar', subKey: 'trendRadarSub' },
  '/subscriptions': { titleKey: 'subscriptions', subKey: 'subscriptionsSub' },
  '/tasks': { titleKey: 'tasks', subKey: 'tasksSub' },
  '/batch-import': { titleKey: 'batch', subKey: 'batchSub' },
  '/collections': { titleKey: 'collections', subKey: '' },
  '/knowledge': { titleKey: 'knowledge', subKey: '' },
  '/guide': { titleKey: 'guide', subKey: '' },
}

const SidebarNavItem: FC<{
  item: NavItem
  lang: 'zh' | 'en'
  showEn: boolean
  collapsed: boolean
}> = ({
  item,
  lang,
  showEn,
  collapsed,
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const isExactMatch = location.pathname === item.path
  const isPrefixMatch =
    item.path !== '/' &&
    item.path !== '/settings/model' &&
    location.pathname.startsWith(item.path + '/')
  // for the AI models item, treat any /settings/ child (without its own nav) as a fallback for /settings root
  const active = isExactMatch || isPrefixMatch
  const zh = trVm(item.zhKey, 'zh')
  const en = trVm(item.zhKey, 'en')
  const label = lang === 'zh' ? zh : en
  const altLabel = lang === 'zh' ? en : zh
  return (
    <button
      className={'vm-nav-item' + (active ? ' active' : '')}
      onClick={() => navigate(item.path)}
      title={collapsed ? label : undefined}
    >
      <span className="vm-nav-ico">{item.icon}</span>
      {!collapsed && <span>{label}</span>}
      {!collapsed && showEn && <span className="vm-nav-en">{altLabel}</span>}
    </button>
  )
}

const ThemeQuickSwitch: FC = () => {
  const theme = useThemeStore(s => s.theme)
  const setTheme = useThemeStore(s => s.setTheme)
  const order: VmTheme[] = ['slate', 'warm', 'sage', 'mono']
  const next = order[(order.indexOf(theme) + 1) % order.length]
  const cur = VM_THEMES.find(t => t.id === theme)!
  return (
    <button
      className="vm-btn vm-btn-outline vm-btn-sm"
      title={`Theme: ${cur.zh} · ${cur.en}`}
      onClick={() => setTheme(next)}
    >
      <Palette size={15} />
      <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {cur.dots.map((c, i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: c,
              border: '1px solid rgba(0,0,0,.08)',
            }}
          />
        ))}
      </span>
    </button>
  )
}

const MainLayout: FC = () => {
  const lang = useVmLang()
  const setLang = useThemeStore(s => s.setLang)
  const showEn = useThemeStore(s => s.showNavEn)
  const setCurrentTask = useTaskStore(s => s.setCurrentTask)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hotCollapsed, setHotCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const isHotActive = hotNav.some(
    n => location.pathname === n.path || location.pathname.startsWith(n.path + '/'),
  )
  // auto-expand hot group when on a hot page
  useEffect(() => {
    if (isHotActive) setHotCollapsed(false)
  }, [isHotActive])

  // 顶栏 / 侧栏的「新建笔记」入口：清空当前选中的笔记，再回 / 路由。
  // 不清空的话，当用户正在看某条笔记时点这个按钮，HomePage 仍会显示阅读器而不是表单。
  const handleNewNote = () => {
    setCurrentTask(null)
    navigate('/')
  }

  const meta = useMemo(() => {
    if (pageMeta[location.pathname]) return pageMeta[location.pathname]
    if (location.pathname.startsWith('/settings')) {
      const seg = location.pathname.split('/')[2]
      const key =
        seg === 'transcriber'
          ? 'transcriber'
          : seg === 'download'
            ? 'downloader'
            : seg === 'feishu'
              ? 'feishu'
              : seg === 'access-password'
              ? 'accessPassword'
              : seg === 'monitor'
                ? 'monitor'
                : seg === 'about'
                  ? 'about'
                  : 'aiModels'
      return { titleKey: key, subKey: '' }
    }
    return { titleKey: 'workspace', subKey: 'newNoteSub' }
  }, [location.pathname])
  const hidePageHeading = location.pathname === '/articles'

  return (
    <div className={'vm-app vm-scope' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <aside className="vm-sidebar">
        <div className="vm-brand">
          <BrandMark />
          <div className="vm-brand-text">
            <div className="vm-brand-name">VideoMemo</div>
            <div className="vm-brand-sub">AI VIDEO NOTES</div>
          </div>
          <button
            className="vm-sidebar-toggle"
            type="button"
            title={sidebarCollapsed ? '展开菜单栏' : '收起菜单栏'}
            onClick={() => setSidebarCollapsed(v => !v)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <button
          className="vm-btn vm-btn-primary vm-btn-block vm-sidebar-new"
          style={{ margin: '2px 4px 8px', width: 'calc(100% - 8px)' }}
          onClick={handleNewNote}
          title={sidebarCollapsed ? trVm('newNote', lang) : undefined}
        >
          <Plus size={18} />
          {!sidebarCollapsed && trVm('newNote', lang)}
        </button>

        <div className="vm-nav-group-label">{lang === 'zh' ? '工作台' : 'Workspace'}</div>
        {workspaceNav.map(n => (
          <SidebarNavItem
            key={n.id}
            item={n}
            lang={lang}
            showEn={showEn}
            collapsed={sidebarCollapsed}
          />
        ))}

        {/* 热点 — collapsible group */}
        {!sidebarCollapsed ? (
          <button
            className={'vm-nav-item vm-nav-group-toggle' + (isHotActive ? ' active' : '')}
            onClick={() => setHotCollapsed(v => !v)}
            style={{ justifyContent: 'space-between', width: '100%' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="vm-nav-ico"><Flame size={17} /></span>
              <span>{lang === 'zh' ? '热点' : 'Trending'}</span>
            </span>
            {hotCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <div className="vm-nav-group-label">{lang === 'zh' ? '热点' : 'Hot'}</div>
        )}
        {!sidebarCollapsed && hotCollapsed ? null : (
          hotNav.map(n => (
            <SidebarNavItem
              key={n.id}
              item={n}
              lang={lang}
              showEn={showEn}
              collapsed={sidebarCollapsed}
            />
          ))
        )}

        {guideNav.map(n => (
          <SidebarNavItem
            key={n.id}
            item={n}
            lang={lang}
            showEn={showEn}
            collapsed={sidebarCollapsed}
          />
        ))}

        <div className="vm-nav-group-label">{lang === 'zh' ? '设置' : 'Settings'}</div>
        {settingsNav.map(n => (
          <SidebarNavItem
            key={n.id}
            item={n}
            lang={lang}
            showEn={showEn}
            collapsed={sidebarCollapsed}
          />
        ))}

        <div className="vm-sidebar-foot">
          <div className="vm-usage-card">
            <div className="vm-usage-row">
              <span>{trVm('usage', lang)}</span>
              <span className="vm-usage-num">128</span>
            </div>
            <div className="vm-usage-row" style={{ marginTop: 2 }}>
              <span className="vm-faint" style={{ fontSize: 11 }}>
                {trVm('notesUnit', lang)}
              </span>
            </div>
            <div className="vm-usage-bar">
              <i style={{ width: '64%' }} />
            </div>
          </div>
        </div>
      </aside>

      <div className="vm-main">
        <header className="vm-topbar">
          {!hidePageHeading && (
            <div style={{ minWidth: 0 }}>
              <div className="vm-page-title">{trVm(meta.titleKey, lang)}</div>
              {meta.subKey && <div className="vm-page-sub">{trVm(meta.subKey, lang)}</div>}
            </div>
          )}
          <div className="vm-topbar-actions">
            {location.pathname === '/' && (
              <button
                className="vm-btn vm-btn-outline vm-btn-sm"
                onClick={() => navigate('/batch-import')}
              >
                <FileStack size={16} />
                {trVm('batch', lang)}
              </button>
            )}
            <ThemeQuickSwitch />
            <div className="vm-seg">
              <button
                className={'vm-seg-item' + (lang === 'zh' ? ' active' : '')}
                onClick={() => setLang('zh')}
              >
                中文
              </button>
              <button
                className={'vm-seg-item' + (lang === 'en' ? ' active' : '')}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>
          </div>
        </header>
        <div className="vm-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default MainLayout
