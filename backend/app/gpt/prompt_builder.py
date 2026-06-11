from app.gpt.prompt import BASE_PROMPT

note_formats = [
    {'label': '目录', 'value': 'toc'},
    {'label': '原片跳转', 'value': 'link'},
    {'label': '原片截图', 'value': 'screenshot'},
    {'label': 'AI总结', 'value': 'summary'}
]

note_styles = [
    {'label': '精简', 'value': 'minimal'},
    {'label': '详细', 'value': 'detailed'},
    {'label': '学术', 'value': 'academic'},
    {"label": '教程',"value": 'tutorial', },
    {'label': '小红书', 'value': 'xiaohongshu'},
    {'label': '生活向', 'value': 'life_journal'},
    {'label': '任务导向', 'value': 'task_oriented'},
    {'label': '商业风格', 'value': 'business'},
    {'label': '会议纪要', 'value': 'meeting_minutes'}
]


# 生成 BASE_PROMPT 函数
def generate_base_prompt(title, segment_text, tags, _format=None, style=None, extras=None):
    # 生成 Base Prompt 开头部分
    prompt = BASE_PROMPT.format(
        video_title=title,
        segment_text=segment_text,
        tags=tags
    )

    # 添加用户选择的格式
    if _format:
        prompt += "\n" + "\n".join([get_format_function(f) for f in _format])

    # 根据用户选择的笔记风格添加描述
    if style:
        prompt += "\n" + get_style_format(style)

    # 添加额外内容
    if extras:
        prompt += f"\n{extras}"
    return prompt


# 获取格式函数
def get_format_function(format_type):
    format_map = {
        'toc': get_toc_format,
        'link': get_link_format,
        'screenshot': get_screenshot_format,
        'summary': get_summary_format
    }
    return format_map.get(format_type, lambda: '')()


# 风格描述的处理
def get_style_format(style):
    style_map = {
        'minimal': '- **精简信息**: 仅记录最重要的内容，简洁明了。',
        'detailed': '- **详细记录**: 包含完整的内容和每个部分的详细讨论。需要尽可能多的记录视频内容，最好详细的笔记',
        'academic': '- **学术风格**: 适合学术报告，正式且结构化。',
        'xiaohongshu': '''- **小红书风格**:
### 擅长使用下面的爆款关键词：
好用到哭，大数据，教科书般，小白必看，宝藏，绝绝子神器，都给我冲,划重点，笑不活了，YYDS，秘方，我不允许，压箱底，建议收藏，停止摆烂，上天在提醒你，挑战全网，手把手，揭秘，普通女生，沉浸式，有手就能做吹爆，好用哭了，搞钱必看，狠狠搞钱，打工人，吐血整理，家人们，隐藏，高级感，治愈，破防了，万万没想到，爆款，永远可以相信被夸爆手残党必备，正确姿势

### 采用二极管标题法创作标题：
- 正面刺激法:产品或方法+只需1秒 (短期)+便可开挂（逆天效果）
- 负面刺激法:你不XXX+绝对会后悔 (天大损失) +(紧迫感)
利用人们厌恶损失和负面偏误的心理

### 写作技巧
1. 使用惊叹号、省略号等标点符号增强表达力，营造紧迫感和惊喜感。
2. **使用emoji表情符号，来增加文字的活力**
3. 采用具有挑战性和悬念的表述，引发读、“无敌者好奇心，例如“暴涨词汇量”了”、“拒绝焦虑”等
4. 利用正面刺激和负面激，诱发读者的本能需求和动物基本驱动力，如“离离原上谱”、“你不知道的项目其实很赚”等
5. 融入热点话题和实用工具，提高文章的实用性和时效性，如“2023年必知”、“chatGPT狂飙进行时”等
6. 描述具体的成果和效果，强调标题中的关键词，使其更具吸引力，例如“英语底子再差，搞清这些语法你也能拿130+”
7. 使用吸引人的标题：''',

        'life_journal': '- **生活向**: 记录个人生活感悟，情感化表达。',
        'task_oriented': '- **任务导向**: 强调任务、目标，适合工作和待办事项。',
        'business': '- **商业风格**: 适合商业报告、会议纪要，正式且精准。',
        'meeting_minutes': '- **会议纪要**: 适合商业报告、会议纪要，正式且精准。',
        'tutorial': '- **教程笔记**: 尽可能详细的记录教程，特别是关键点和一些重要的结论步骤。'
    }
    return style_map.get(style, '')


# 格式化输出内容
def get_toc_format():
    return '''
- **目录**: 在笔记开头生成目录，使用以下格式（二级标题 + 无序列表，可按需嵌套子项）：

  ## 目录

  - 章节标题一
  - 章节标题二
    - 小节标题

  唯一的硬性要求：目录条目（含子项）内**禁止出现 `#`/`##` 等标题标记**
  （即不要写成 `- ## 章节标题`，否则条目会渲染得和正文标题一样大）。
  目录条目内不需要插入原片跳转时间标记。
    '''


def get_link_format():
    return '''
- **原片跳转（重要）**: 为每个 `##` 主章节标题追加该段起始时间标记，格式严格为
  `*Content-[mm:ss]`（mm:ss 为两位分:两位秒），且必须「标题在前、标记在后」写在同一行。

  正确示例：`## AI 的发展史 *Content-[01:23]`

  禁止把标记写在标题之前，禁止让标记单独成行，禁止省略方括号或使用其他时间格式。
    '''


def get_screenshot_format():
    return '''
- **原片截图**: 请根据转写文案里的时间点，在最能帮助用户理解的位置插入截图标记，
  必须严格按照以下格式返回，否则系统无法解析：

  格式：`*Screenshot-[mm:ss]`

  插入规则：
  - 适合插入的内容：UI 演示、产品操作流程、软件界面讲解、图表分析、架构图说明、
    代码讲解、实时调试过程、前后效果对比
  - 即使没有收到视频画面，也要根据转写文本中的时间点选择 2～4 个最有代表性的截图位置
  - 每个章节最多一个截图标记
  - 没有视觉价值时不要添加，不允许滥用
    '''


def get_summary_format():
    return '''
- **AI 总结**: 在笔记末尾追加二级标题 `## AI 总结`，用中文总结视频主题、核心观点、
  关键结论与实践建议，长度控制在 150~300 字。
    '''
