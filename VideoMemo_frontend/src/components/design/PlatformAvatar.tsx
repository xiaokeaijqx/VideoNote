import { FC } from 'react'

export interface PlatformBrand {
  zh: string
  en: string
  short: string
  color: string
}

export const PLATFORMS: Record<string, PlatformBrand> = {
  // Video platforms
  bilibili: { zh: '哔哩哔哩', en: 'Bilibili', short: 'B', color: '#FB7299' },
  'bilibili-hot-search': { zh: 'B站热搜', en: 'Bili Search', short: '搜', color: '#E8649A' },
  youtube: { zh: 'YouTube', en: 'YouTube', short: 'YT', color: '#FF0033' },
  douyin: { zh: '抖音', en: 'Douyin', short: '抖', color: '#161823' },
  kuaishou: { zh: '快手', en: 'Kuaishou', short: '快', color: '#FF5000' },
  xiaohongshu: { zh: '小红书', en: 'RED', short: '红', color: '#FF2442' },
  // Social / news
  weibo: { zh: '微博', en: 'Weibo', short: '微', color: '#E6162D' },
  zhihu: { zh: '知乎', en: 'Zhihu', short: '知', color: '#0066FF' },
  baidu: { zh: '百度热搜', en: 'Baidu', short: '百', color: '#2932E1' },
  toutiao: { zh: '今日头条', en: 'Toutiao', short: '头', color: '#E13E2C' },
  ifeng: { zh: '凤凰网', en: 'ifeng', short: '凤', color: '#F07300' },
  thepaper: { zh: '澎湃新闻', en: 'The Paper', short: '澎', color: '#154B85' },
  tieba: { zh: '百度贴吧', en: 'Tieba', short: '贴', color: '#3385FF' },
  hupu: { zh: '虎扑', en: 'Hupu', short: '虎', color: '#C42E2E' },
  tencent: { zh: '腾讯新闻', en: 'Tencent', short: '腾', color: '#007AFF' },
  'tencent-hot': { zh: '腾讯热搜', en: 'Tencent Hot', short: '热', color: '#0066CC' },
  cankaoxiaoxi: { zh: '参考消息', en: 'Cankaoxiaoxi', short: '参', color: '#1B5E20' },
  zaobao: { zh: '联合早报', en: 'Zaobao', short: '早', color: '#1565C0' },
  sputniknewscn: { zh: '卫星社', en: 'Sputnik', short: '卫', color: '#E65100' },
  chongbuluo: { zh: '虫部落', en: 'Chongbuluo', short: '虫', color: '#4CAF50' },
  'chongbuluo-hot': { zh: '虫部落热', en: 'CB Hot', short: '热', color: '#388E3C' },
  'chongbuluo-latest': { zh: '虫部落新', en: 'CB New', short: '新', color: '#81C784' },
  kaopu: { zh: '靠谱新闻', en: 'Kaopu', short: '靠', color: '#2196F3' },
  douban: { zh: '豆瓣', en: 'Douban', short: '豆', color: '#00B51D' },
  // Finance
  wallstreetcn: { zh: '华尔街见闻', en: 'WSCN', short: '华', color: '#2B5F9E' },
  'wallstreetcn-hot': { zh: '华尔街热门', en: 'WSCN Hot', short: '热', color: '#1E88E5' },
  'wallstreetcn-news': { zh: '华尔街最新', en: 'WSCN News', short: '新', color: '#1976D2' },
  'wallstreetcn-quick': { zh: '华尔街快讯', en: 'WSCN Quick', short: '讯', color: '#42A5F5' },
  cls: { zh: '财联社', en: 'CLS', short: '财', color: '#C8372D' },
  'cls-hot': { zh: '财联社热门', en: 'CLS Hot', short: '热', color: '#E53935' },
  'cls-telegraph': { zh: '财联社电报', en: 'CLS Tel', short: '报', color: '#D32F2F' },
  'cls-depth': { zh: '财联社深度', en: 'CLS Deep', short: '深', color: '#B71C1C' },
  '36kr': { zh: '36氪', en: '36kr', short: '氪', color: '#09B043' },
  '36kr-quick': { zh: '36氪快讯', en: '36kr Quick', short: '快', color: '#00C853' },
  '36kr-renqi': { zh: '36氪人气', en: '36kr Hot', short: '气', color: '#69F0AE' },
  jin10: { zh: '金十数据', en: 'Jin10', short: '金', color: '#FF6F00' },
  gelonghui: { zh: '格隆汇', en: 'Gelonghui', short: '格', color: '#C62828' },
  xueqiu: { zh: '雪球', en: 'Xueqiu', short: '雪', color: '#1565C0' },
  'xueqiu-hotstock': { zh: '雪球热门', en: 'XQ Hot', short: '股', color: '#1976D2' },
  mktnews: { zh: 'MKT新闻', en: 'MKTNews', short: 'M', color: '#5D4037' },
  'mktnews-flash': { zh: 'MKT快讯', en: 'MKT Flash', short: '快', color: '#795548' },
  fastbull: { zh: '法布财经', en: 'Fastbull', short: '法', color: '#FF5722' },
  'fastbull-express': { zh: '法布快讯', en: 'FB Express', short: '讯', color: '#F4511E' },
  'fastbull-news': { zh: '法布头条', en: 'FB News', short: '头', color: '#E64A19' },
  // IT / Dev
  ithome: { zh: 'IT之家', en: 'ITHome', short: 'IT', color: '#E53935' },
  juejin: { zh: '掘金', en: 'Juejin', short: '掘', color: '#1E80FF' },
  github: { zh: 'GitHub', en: 'GitHub', short: 'GH', color: '#24292E' },
  'github-trending-today': { zh: 'GitHub趋势', en: 'GH Trending', short: '🔥', color: '#181717' },
  hackernews: { zh: 'Hacker News', en: 'Hacker News', short: 'HN', color: '#FF6600' },
  producthunt: { zh: 'ProductHunt', en: 'ProductHunt', short: 'PH', color: '#DA552F' },
  v2ex: { zh: 'V2EX', en: 'V2EX', short: 'V2', color: '#A1B0CD' },
  'v2ex-share': { zh: 'V2EX分享', en: 'V2EX Share', short: '享', color: '#8898AA' },
  solidot: { zh: 'Solidot', en: 'Solidot', short: 'SO', color: '#5B7553' },
  sspai: { zh: '少数派', en: 'SSPAI', short: '少', color: '#D9171F' },
  coolapk: { zh: '酷安', en: 'Coolapk', short: '酷', color: '#00B050' },
  freebuf: { zh: 'Freebuf', en: 'Freebuf', short: 'F', color: '#29527C' },
  nowcoder: { zh: '牛客', en: 'Nowcoder', short: '牛', color: '#2D8CF0' },
  pcbeta: { zh: '远景论坛', en: 'PCBeta', short: '远', color: '#0078D7' },
  'pcbeta-windows11': { zh: '远景Win11', en: 'PCBeta W11', short: 'W', color: '#0078D4' },
  aihot: { zh: 'AIHOT', en: 'AIHOT', short: 'AI', color: '#8B5CF6' },
  // Article platforms
  wechat_mp: { zh: '微信公众号', en: 'WeChat', short: '公', color: '#07C160' },
  generic_web: { zh: '普通网页', en: 'Web', short: 'W', color: '#6366F1' },
  local: { zh: '本地视频', en: 'Local', short: '⬡', color: '#64748B' },
}

export const Pf: FC<{ id: string; sm?: boolean }> = ({ id, sm }) => {
  const p = PLATFORMS[id] || { short: '?', color: '#94a3b8' }
  return (
    <div className={'vm-pf' + (sm ? ' vm-pf-sm' : '')} style={{ background: p.color }}>
      {p.short}
    </div>
  )
}

export const platformLabel = (id: string, lang: 'zh' | 'en' = 'zh'): string => {
  const p = PLATFORMS[id]
  return p ? p[lang] : id || '-'
}
