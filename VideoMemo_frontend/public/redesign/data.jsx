/* data.jsx — i18n strings, constants, sample data. Exports to window. */

const THEMES = [
  { id: 'warm',  zh: '暖记', en: 'Warm',  desc: { zh: '温暖 · 知识感', en: 'Warm · studious' } },
  { id: 'slate', zh: '精工', en: 'Slate', desc: { zh: '克制 · 工具感', en: 'Crisp · tool-like' } },
  { id: 'sage',  zh: '晨雾', en: 'Sage',  desc: { zh: '清新 · 专注', en: 'Fresh · focused' } },
];

const NOTE_STYLES = [
  { value: 'minimal',         zh: '精简',   en: 'Concise' },
  { value: 'detailed',        zh: '详细',   en: 'Detailed' },
  { value: 'tutorial',        zh: '教程',   en: 'Tutorial' },
  { value: 'academic',        zh: '学术',   en: 'Academic' },
  { value: 'xiaohongshu',     zh: '小红书', en: 'RED post' },
  { value: 'life_journal',    zh: '生活向', en: 'Lifestyle' },
  { value: 'task_oriented',   zh: '任务导向', en: 'Task-first' },
  { value: 'business',        zh: '商业风格', en: 'Business' },
  { value: 'meeting_minutes', zh: '会议纪要', en: 'Minutes' },
];

const FORMATS = [
  { value: 'toc',        zh: '目录',     en: 'Outline',     icon: 'listtree' },
  { value: 'link',       zh: '原片跳转', en: 'Timestamps',  icon: 'link' },
  { value: 'screenshot', zh: '原片截图', en: 'Screenshots', icon: 'image' },
  { value: 'summary',    zh: 'AI 总结',  en: 'AI summary',  icon: 'sparkles' },
];

const QUALITIES = [
  { value: 'fast',   zh: '快速',   en: 'Fast',     hint: { zh: '速度优先', en: 'Speed' } },
  { value: 'medium', zh: '标准',   en: 'Standard', hint: { zh: '推荐', en: 'Balanced' } },
  { value: 'slow',   zh: '高质量', en: 'Best',     hint: { zh: '质量优先', en: 'Quality' } },
];

/* generation steps */
const STEPS = [
  { key: 'PARSING',      zh: '解析链接', en: 'Parse',      icon: 'link' },
  { key: 'DOWNLOADING',  zh: '下载音频', en: 'Download',   icon: 'download' },
  { key: 'TRANSCRIBING', zh: '转写文字', en: 'Transcribe', icon: 'waveform' },
  { key: 'SUMMARIZING',  zh: '总结内容', en: 'Summarize',  icon: 'sparkles' },
  { key: 'SUCCESS',      zh: '保存完成', en: 'Done',       icon: 'check' },
];

const NAV = [
  { id: 'workspace',  zh: '工作区',     en: 'Workspace',   icon: 'grid' },
  { id: 'collections',zh: '分类合集',   en: 'Collections', icon: 'library' },
  { id: 'knowledge',  zh: '知识检索',   en: 'Knowledge',   icon: 'search' },
  { id: 'tasks',      zh: '任务列表',   en: 'Tasks',       icon: 'tasks' },
  { id: 'batch',      zh: '批量导入',   en: 'Batch',       icon: 'stack' },
  { id: 'guide',      zh: '使用说明',   en: 'Guide',       icon: 'book' },
];

/* i18n */
const T = {
  newNote:    { zh: '新建笔记', en: 'New note' },
  newNoteSub: { zh: '粘贴一条视频链接，自动完成下载 · 转写 · 总结', en: 'Paste a video link — download, transcribe & summarize automatically' },
  videoSource:{ zh: '视频来源', en: 'Video source' },
  platform:   { zh: '平台', en: 'Platform' },
  pasteLink:  { zh: '粘贴视频链接，平台将自动识别', en: 'Paste a link — platform auto-detected' },
  localPath:  { zh: '输入本地视频路径', en: 'Local video path' },
  dropFile:   { zh: '拖拽视频到此处，或点击选择文件', en: 'Drop a video here, or click to choose' },
  detected:   { zh: '已识别', en: 'Detected' },
  model:      { zh: 'AI 模型', en: 'AI model' },
  noteStyle:  { zh: '笔记风格', en: 'Note style' },
  quality:    { zh: '音频质量', en: 'Audio quality' },
  contents:   { zh: '内容选项', en: 'Include' },
  contentsHint:{ zh: '选择笔记中要包含的元素', en: 'Pick what the note should contain' },
  videoUnd:   { zh: '视频理解', en: 'Vision' },
  videoUndHint:{ zh: '把关键帧发给多模态模型辅助分析', en: 'Send key frames to a multimodal model' },
  interval:   { zh: '采样间隔 (秒)', en: 'Sample interval (s)' },
  grid:       { zh: '拼图尺寸 (列 × 行)', en: 'Grid (cols × rows)' },
  visionWarn: { zh: '视频理解需使用多模态模型', en: 'Vision requires a multimodal model' },
  notes:      { zh: '备注', en: 'Extra instructions' },
  notesPh:    { zh: '例如：请重点罗列每个步骤的命令…', en: 'e.g. list the exact command for each step…' },
  generate:   { zh: '生成笔记', en: 'Generate note' },
  enable:     { zh: '启用', en: 'Enable' },
  // batch
  batch:      { zh: '批量视频导入', en: 'Batch import' },
  batchSub:   { zh: '每行一个链接，统一设置后一键生成', en: 'One link per line — one set of options, generate all at once' },
  links:      { zh: '视频链接', en: 'Video links' },
  linksHint:  { zh: '每行粘贴一个', en: 'One per line' },
  valid:      { zh: '有效', en: 'Valid' },
  invalid:    { zh: '无法识别', en: 'Unrecognized' },
  willSkip:   { zh: '以下链接无法识别平台，将被跳过', en: 'These links could not be matched and will be skipped' },
  queue:      { zh: '待生成队列', en: 'Queue' },
  emptyQueue: { zh: '粘贴链接后，识别到的视频会列在这里', en: 'Recognized videos will appear here once you paste links' },
  options:    { zh: '统一选项', en: 'Shared options' },
  batchGen:   { zh: '批量生成', en: 'Generate all' },
  // tasks
  tasks:      { zh: '任务列表', en: 'Tasks' },
  tasksSub:   { zh: '所有生成任务的状态、Token 与耗时', en: 'Status, tokens and timing for every job' },
  total:      { zh: '共', en: '' },
  totalUnit:  { zh: '个任务', en: 'tasks' },
  running:    { zh: '进行中', en: 'Running' },
  done:       { zh: '已完成', en: 'Done' },
  failed:     { zh: '失败', en: 'Failed' },
  all:        { zh: '全部', en: 'All' },
  colVideo:   { zh: '视频', en: 'Video' },
  colPlatform:{ zh: '平台', en: 'Platform' },
  colModel:   { zh: '模型', en: 'Model' },
  colStatus:  { zh: '状态', en: 'Status' },
  colTokens:  { zh: 'Token', en: 'Tokens' },
  colStyle:   { zh: '风格', en: 'Style' },
  colCreated: { zh: '创建时间', en: 'Created' },
  colActions: { zh: '操作', en: '' },
  view:       { zh: '查看', en: 'View' },
  retry:      { zh: '重试', en: 'Retry' },
  del:        { zh: '删除', en: 'Delete' },
  emptyTasks: { zh: '还没有任务', en: 'No tasks yet' },
  emptyTasksSub:{ zh: '去新建一篇笔记，任务会实时出现在这里', en: 'Create a note — jobs will show up here in real time' },
  emptyTasksCta:{ zh: '新建笔记', en: 'New note' },
  // flow
  flowTitle:  { zh: '正在生成笔记', en: 'Generating your note' },
  flowSub:    { zh: '可在前三步随时暂停；进入总结后将自动锁定', en: 'Pause anytime in the first three steps; locked once summarizing' },
  pause:      { zh: '暂停', en: 'Pause' },
  flowDone:   { zh: '笔记已生成', en: 'Note ready' },
  flowDoneSub:{ zh: '已保存到工作区，去看看吧', en: 'Saved to your workspace' },
  openNote:   { zh: '打开笔记', en: 'Open note' },
  again:      { zh: '再来一条', en: 'New one' },
  elapsed:    { zh: '已用时', en: 'Elapsed' },
  // misc
  usage:      { zh: '本月用量', en: 'This month' },
  notesCount: { zh: '篇笔记', en: 'notes' },
};

const tr = (lang, key) => (T[key] ? T[key][lang] : key);

/* sample tasks for the task list */
const SAMPLE_TASKS = [
  { id: 't1', title: '5分钟安装 Claude Code 并接入 DeepSeek', titleEn: 'Install Claude Code with DeepSeek in 5 min', url: 'https://www.bilibili.com/video/BV1x…', platform: 'bilibili', model: 'deepseek-v4-flash', style: 'tutorial', status: 'SUCCESS', tokens: 18420, created: '11:13', dur: '2m 41s' },
  { id: 't2', title: '别再乱装 Skill 了！这 4 组才是顶级生产力', titleEn: '4 skill groups that actually matter', url: 'https://www.bilibili.com/video/BV1q…', platform: 'bilibili', model: 'gpt-4o-mini', style: 'detailed', status: 'SUCCESS', tokens: 32910, created: '10:48', dur: '4m 02s' },
  { id: 't3', title: 'What are skills?', titleEn: 'What are skills?', url: 'https://www.youtube.com/watch?v=…', platform: 'youtube', model: 'claude-3.5-sonnet', style: 'academic', status: 'RUNNING', step: 'TRANSCRIBING', tokens: 0, created: '11:31', dur: '—' },
  { id: 't4', title: '住在巴厘岛的数字游民都在做什么工作', titleEn: 'What do Bali digital nomads do', url: 'https://v.douyin.com/i…', platform: 'douyin', model: 'deepseek-v4-flash', style: 'life_journal', status: 'RUNNING', step: 'SUMMARIZING', tokens: 9120, created: '11:29', dur: '—' },
  { id: 't5', title: '黄仁勋 CMU 毕业演讲（中英双语）', titleEn: 'Jensen Huang CMU commencement', url: 'https://www.bilibili.com/video/BV1h…', platform: 'bilibili', model: 'gpt-4o', style: 'meeting_minutes', status: 'FAILED', tokens: 0, created: '09:55', dur: '—' },
  { id: 't6', title: '本地录屏 · 产品评审会议', titleEn: 'Local screen recording · product review', url: '', platform: 'local', model: 'qwen2.5-72b', style: 'meeting_minutes', status: 'SUCCESS', tokens: 41200, created: '昨天 18:20', dur: '6m 30s' },
];

Object.assign(window, { THEMES, NOTE_STYLES, FORMATS, QUALITIES, STEPS, NAV, T, tr, SAMPLE_TASKS });
