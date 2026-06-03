import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AudioLines, AlertTriangle, CheckCircle2, Download, Loader2, Save, Trash2, XCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getTranscriberConfig,
  updateTranscriberConfig,
  getModelsStatus,
  downloadModel,
  deleteModel,
  TranscriberConfig,
  ModelStatus,
} from '@/services/transcriber'

const isWhisperType = (type: string) =>
  type === 'fast-whisper' || type === 'mlx-whisper'

// FunASR 常用模型参考：填入「FunASR 模型」框即可，首次使用经 modelscope 自动下载。
// 所有模型共用同一安装命令（pip install funasr torch torchaudio）。
const FUNASR_MODELS = [
  {
    id: 'paraformer-zh',
    lang: '中文',
    speed: '较慢·高精度',
    note: '大模型，带标点 + 句级时间戳（截图/跳转定位准）。默认推荐。',
    extra: '',
  },
  {
    id: 'SenseVoiceSmall',
    lang: '中/粤/英/日/韩',
    speed: '很快·CPU 友好',
    note: '轻量多语模型，速度比 paraformer 快数倍，含情感/音频事件；句级时间戳较弱（截图定位可能不精确）。',
    extra: '',
  },
  {
    id: 'paraformer-zh-streaming',
    lang: '中文',
    speed: '低延迟流式',
    note: '实时流式场景用；无句级时间戳。离线视频笔记请优先 paraformer-zh。',
    extra: '',
  },
  // 注：paraformer-en 与 funasr 1.3.x 存在词表不匹配 bug（解码越界崩溃），暂不列出；
  // 英文/多语视频请用 SenseVoiceSmall 或 Whisper 引擎。
]

export default function Transcriber() {
  const [config, setConfig] = useState<TranscriberConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedType, setSelectedType] = useState('')
  const [selectedModelSize, setSelectedModelSize] = useState('')
  const [customModel, setCustomModel] = useState('') // 自定义 whisper 模型路径/仓库 id
  // FunASR 模型：下拉选预设（与 whisper 模型大小交互一致），'__custom__' 时启用自定义输入
  const [funasrSelect, setFunasrSelect] = useState('paraformer-zh')
  const [funasrCustom, setFunasrCustom] = useState('')
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[]>([])
  const [mlxModelStatuses, setMlxModelStatuses] = useState<ModelStatus[]>([])
  const [funasrModelStatuses, setFunasrModelStatuses] = useState<ModelStatus[]>([])
  const [mlxAvailable, setMlxAvailable] = useState(false)

  const fetchModelsStatus = useCallback(async () => {
    try {
      const data = await getModelsStatus()
      setModelStatuses(data.whisper)
      setMlxModelStatuses(data.mlx_whisper)
      setFunasrModelStatuses(data.funasr || [])
      setMlxAvailable(data.mlx_available)
    } catch {
      // 静默失败，不阻塞主流程
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getTranscriberConfig()
        setConfig(data)
        setSelectedType(data.transcriber_type)
        setSelectedModelSize(data.whisper_model_size)
        setCustomModel(data.whisper_custom_model || '')
        const fm = data.funasr_model || 'paraformer-zh'
        if (FUNASR_MODELS.some(m => m.id === fm)) {
          setFunasrSelect(fm)
        } else {
          setFunasrSelect('__custom__')
          setFunasrCustom(fm)
        }
      } catch {
        toast.error('获取转写器配置失败')
      } finally {
        setLoading(false)
      }
    }
    load()
    fetchModelsStatus()
  }, [fetchModelsStatus])

  // 有下载中的模型时自动轮询状态
  useEffect(() => {
    const hasDownloading =
      modelStatuses.some(m => m.downloading) ||
      mlxModelStatuses.some(m => m.downloading) ||
      funasrModelStatuses.some(m => m.downloading)
    if (!hasDownloading) return

    const timer = setInterval(fetchModelsStatus, 3000)
    return () => clearInterval(timer)
  }, [modelStatuses, mlxModelStatuses, funasrModelStatuses, fetchModelsStatus])

  const handleSave = async () => {
    // 自定义 whisper 模型：必须填路径/仓库 id
    if (selectedType === 'fast-whisper' && selectedModelSize === 'custom' && !customModel.trim()) {
      toast('请填写自定义模型的本地路径或 HuggingFace 仓库 id', { icon: '⚠️' })
      return
    }
    // 自定义 FunASR 模型：必须填模型名/本地目录
    if (selectedType === 'funasr' && funasrSelect === '__custom__' && !funasrCustom.trim()) {
      toast('请填写自定义 FunASR 模型名或本地目录', { icon: '⚠️' })
      return
    }
    // FunASR 预设模型未下载时拦截保存，引导先在「模型管理」下载（避免首个任务卡在边跑边下）
    if (selectedType === 'funasr' && funasrSelect !== '__custom__') {
      const st = funasrModelStatuses.find(s => s.model_size === funasrSelect)
      if (st && !st.downloaded) {
        toast(
          st.downloading
            ? '模型正在下载中，请等待下载完成后再保存'
            : `模型 ${funasrSelect} 尚未下载，请先在下方「模型管理」中点击下载`,
          { icon: st.downloading ? '⏳' : '⚠️' },
        )
        return
      }
    }
    // whisper 预设模型未下载时同样拦截保存（与 FunASR 一致；自定义模型跳过）
    if (isWhisperType(selectedType) && selectedModelSize !== 'custom') {
      const pool = selectedType === 'mlx-whisper' ? mlxModelStatuses : modelStatuses
      const target = pool.find(m => m.model_size === selectedModelSize)
      if (target && !target.downloaded) {
        toast(
          target.downloading
            ? '模型正在下载中，请等待下载完成后再保存'
            : `模型 ${selectedModelSize} 尚未下载，请先在下方「模型管理」中点击下载`,
          { icon: target.downloading ? '⏳' : '⚠️' },
        )
        return
      }
    }

    setSaving(true)
    try {
      const payload: {
        transcriber_type: string
        whisper_model_size?: string
        whisper_custom_model?: string
        funasr_model?: string
      } = {
        transcriber_type: selectedType,
      }
      if (isWhisperType(selectedType)) {
        payload.whisper_model_size = selectedModelSize
        if (selectedType === 'fast-whisper' && selectedModelSize === 'custom') {
          payload.whisper_custom_model = customModel.trim()
        }
      }
      if (selectedType === 'funasr') {
        payload.funasr_model =
          funasrSelect === '__custom__' ? funasrCustom.trim() : funasrSelect
      }
      await updateTranscriberConfig(payload)
      toast.success('转写器配置已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = async (modelSize: string, transcriberType: string) => {
    try {
      await downloadModel({ model_size: modelSize, transcriber_type: transcriberType })
      toast.success(`模型 ${modelSize} 开始下载`)
      // 立即刷新状态
      setTimeout(fetchModelsStatus, 1000)
    } catch {
      toast.error('下载请求失败')
    }
  }

  // 卸载确认（应用内弹窗，兼容桌面端）
  const [pendingDelete, setPendingDelete] = useState<{ size: string; type: string } | null>(null)

  const confirmDeleteModel = async () => {
    if (!pendingDelete) return
    try {
      await deleteModel({ model_size: pendingDelete.size, transcriber_type: pendingDelete.type })
      toast.success(`模型 ${pendingDelete.size} 已卸载`)
      fetchModelsStatus()
    } catch {
      toast.error('卸载失败')
    } finally {
      setPendingDelete(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  if (!config) {
    return <div className="p-6 text-center text-neutral-500">无法加载配置</div>
  }

  const currentModels = selectedType === 'mlx-whisper' ? mlxModelStatuses : modelStatuses

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold">音频转写配置</h2>
        <p className="mt-1 text-sm text-neutral-500">
          选择视频音频转写为文字所使用的引擎，保存后对新任务立即生效
        </p>
      </div>

      {/* 转写引擎选择 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AudioLines className="h-5 w-5" />
            转写引擎
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">转写器类型</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.available_types.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isWhisperType(selectedType) && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Whisper 模型大小</label>
              <Select value={selectedModelSize} onValueChange={setSelectedModelSize}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.whisper_model_sizes
                    // 自定义模型仅 faster-whisper 支持；mlx 不提供 custom 选项
                    .filter(size => size !== 'custom' || selectedType === 'fast-whisper')
                    .map(size => {
                      const status = currentModels.find(m => m.model_size === size)
                      return (
                        <SelectItem key={size} value={size}>
                          <span className="flex items-center gap-2">
                            {size === 'custom' ? '自定义…' : size}
                            {status?.downloaded && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                          </span>
                        </SelectItem>
                      )
                    })}
                </SelectContent>
              </Select>
              {selectedModelSize === 'custom' ? (
                <div className="space-y-1">
                  <input
                    className="w-full max-w-xl rounded-md border px-3 py-2 text-sm"
                    placeholder="本地模型目录，如 /Users/you/models/my-whisper；或 HF 仓库 id，如 Systran/faster-whisper-large-v3"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                  />
                  <p className="text-xs text-neutral-400">
                    需为 CTranslate2 / faster-whisper 格式（目录含 model.bin、config.json 等）。
                    本地路径离线可用；填仓库 id 会在首次转写时联网下载。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  模型越大精度越高，但速度更慢、占用更多显存
                </p>
              )}
            </div>
          )}

          {/* FunASR 模型设置 + 不可用安装指引 */}
          {selectedType === 'funasr' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">FunASR 模型</label>
              <Select value={funasrSelect} onValueChange={setFunasrSelect}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUNASR_MODELS.map(m => {
                    const st = funasrModelStatuses.find(s => s.model_size === m.id)
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          {m.id}
                          {st?.downloaded && (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          )}
                        </span>
                      </SelectItem>
                    )
                  })}
                  <SelectItem value="__custom__">自定义…</SelectItem>
                </SelectContent>
              </Select>
              {funasrSelect === '__custom__' ? (
                <div className="space-y-1">
                  <input
                    className="w-full max-w-xl rounded-md border px-3 py-2 text-sm"
                    placeholder="modelscope 模型名或本地模型目录"
                    value={funasrCustom}
                    onChange={e => setFunasrCustom(e.target.value)}
                  />
                  <p className="text-xs text-neutral-400">
                    填 modelscope 上的模型 id 或本地目录；首次使用自动下载。
                  </p>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  {FUNASR_MODELS.find(m => m.id === funasrSelect)?.note ||
                    '可在下方「模型管理」预下载模型'}
                </p>
              )}

              {!config.funasr_available && (
                <Alert variant="warning" className="text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">FunASR 当前不可用</p>
                    {/* 桌面端后端不下发安装命令（torch 与打包运行时不兼容），只显示说明 */}
                    {config.funasr_install_command && (
                      <>
                        <p className="mt-2">在「终端」中执行以下命令安装：</p>
                        <div className="mt-1 flex items-start gap-2">
                          <code className="block flex-1 rounded bg-neutral-100 px-2 py-1.5 text-xs break-all select-all">
                            {config.funasr_install_command}
                          </code>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(config.funasr_install_command || '')
                                .then(() => toast.success('命令已复制'))
                                .catch(() => toast.error('复制失败，请手动选择复制'))
                            }}
                          >
                            复制命令
                          </Button>
                        </div>
                      </>
                    )}
                    {config.funasr_install_note && (
                      <p className="mt-2 text-xs text-neutral-500">{config.funasr_install_note}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {selectedType === 'mlx-whisper' && !config.mlx_whisper_available && (
            <Alert variant="warning" className="text-sm">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">MLX Whisper 当前不可用（需要 macOS + Apple Silicon）</p>
                <p className="mt-2">在「终端」中执行以下命令安装：</p>
                <div className="mt-1 flex items-start gap-2">
                  <code className="block flex-1 rounded bg-neutral-100 px-2 py-1.5 text-xs break-all select-all">
                    {config.mlx_install_command || 'pip install mlx_whisper'}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(config.mlx_install_command || 'pip install mlx_whisper')
                        .then(() => toast.success('命令已复制'))
                        .catch(() => toast.error('复制失败，请手动选择复制'))
                    }}
                  >
                    复制命令
                  </Button>
                </div>
                {config.mlx_install_note && (
                  <p className="mt-2 text-xs text-neutral-500">{config.mlx_install_note}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSave}
            disabled={
              saving ||
              (selectedType === 'mlx-whisper' && !config.mlx_whisper_available) ||
              (selectedType === 'funasr' && !config.funasr_available)
            }
            className="mt-2"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存配置
          </Button>
        </CardContent>
      </Card>

      {/* Whisper 模型管理 */}
      {isWhisperType(selectedType) && currentModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5" />
              模型管理
              <span className="text-sm font-normal text-neutral-400">
                {selectedType === 'mlx-whisper' ? 'MLX Whisper' : 'Faster Whisper'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {currentModels.map(model => (
                <div
                  key={model.model_size}
                  className="flex items-center justify-between rounded-md border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{model.model_size}</span>
                    {model.downloaded ? (
                      <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                        已下载
                      </Badge>
                    ) : model.downloading ? (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        下载中
                      </Badge>
                    ) : (
                      <Badge variant="outline">未下载</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {model.downloaded && !model.downloading && (
                      <button
                        type="button"
                        title="卸载模型"
                        className="p-1 text-neutral-300 transition-colors hover:text-red-500"
                        onClick={() =>
                          setPendingDelete({ size: model.model_size, type: selectedType })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {!model.downloaded && !model.downloading && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(model.model_size, selectedType)}
                      >
                        <Download className="mr-1 h-4 w-4" />
                        下载
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FunASR 模型管理（结构与 Whisper 模型管理一致） */}
      {selectedType === 'funasr' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5" />
              模型管理
              <span className="text-sm font-normal text-neutral-400">FunASR</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {FUNASR_MODELS.map(m => {
                const st = funasrModelStatuses.find(s => s.model_size === m.id)
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{m.id}</span>
                        <Badge variant="outline" className="text-[10px]">{m.lang}</Badge>
                        <Badge variant="outline" className="text-[10px]">{m.speed}</Badge>
                        {st?.downloaded ? (
                          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                            已下载
                          </Badge>
                        ) : st?.downloading ? (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            下载中
                          </Badge>
                        ) : (
                          <Badge variant="outline">未下载</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-400">{m.note}</p>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      {st?.downloaded && !st?.downloading && (
                        <button
                          type="button"
                          title="卸载模型"
                          className="p-1 text-neutral-300 transition-colors hover:text-red-500"
                          onClick={() => setPendingDelete({ size: m.id, type: 'funasr' })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {!st?.downloaded && !st?.downloading && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(m.id, 'funasr')}
                        >
                          <Download className="mr-1 h-4 w-4" />
                          下载
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={funasrSelect === m.id ? 'default' : 'outline'}
                        onClick={() => setFunasrSelect(m.id)}
                      >
                        {funasrSelect === m.id ? '已选' : '使用'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              依赖安装（所有模型共用一次）：
              <code className="mx-1 rounded bg-neutral-100 px-1.5 py-0.5 select-all">
                pip install funasr torch torchaudio
              </code>
              ；切换模型只是更换下载内容，无需重装依赖。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 卸载模型确认弹窗 */}
      <Dialog open={pendingDelete !== null} onOpenChange={o => !o && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>卸载模型</DialogTitle>
            <DialogDescription>
              将删除本地模型文件「{pendingDelete?.size}」以释放磁盘空间，之后可随时重新下载。
              确定卸载吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDeleteModel}>
              卸载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
