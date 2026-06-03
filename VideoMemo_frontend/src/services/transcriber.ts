import request from '@/utils/request'

export interface TranscriberConfig {
  transcriber_type: string
  whisper_model_size: string
  available_types: { value: string; label: string }[]
  whisper_model_sizes: string[]
  mlx_whisper_available: boolean
  /** mlx_whisper 不可用时的精确安装命令（桌面端是 pip --target 插件目录） */
  mlx_install_command?: string
  /** 安装命令的补充说明（Python 版本要求、生效方式） */
  mlx_install_note?: string
  /** 桌面端插件目录绝对路径（源码模式为空串） */
  mlx_plugin_dir?: string
  /** 自定义 whisper 模型：本地 CTranslate2 目录 或 HF 仓库 id（size 选 custom 时使用） */
  whisper_custom_model?: string
  /** FunASR 模型名/路径（modelscope id 或本地目录） */
  funasr_model?: string
  /** FunASR 引擎是否可用（已安装 funasr） */
  funasr_available?: boolean
  funasr_install_command?: string
  funasr_install_note?: string
}

export interface ModelStatus {
  model_size: string
  downloaded: boolean
  downloading: boolean
}

export interface ModelsStatusResponse {
  whisper: ModelStatus[]
  mlx_whisper: ModelStatus[]
  mlx_available: boolean
  /** FunASR 常用模型的预下载状态（model_size 字段承载 FunASR 模型名） */
  funasr?: ModelStatus[]
}

export const getTranscriberConfig = async (): Promise<TranscriberConfig> => {
  return await request.get('/transcriber_config')
}

export const updateTranscriberConfig = async (data: {
  transcriber_type: string
  whisper_model_size?: string
  whisper_custom_model?: string
  funasr_model?: string
}) => {
  return await request.post('/transcriber_config', data)
}

export const getModelsStatus = async (): Promise<ModelsStatusResponse> => {
  return await request.get('/transcriber_models_status')
}

export const downloadModel = async (data: {
  model_size: string
  transcriber_type?: string
}) => {
  return await request.post('/transcriber_download', data)
}

/** 卸载（删除）已下载到本地的模型，可重新下载 */
export const deleteModel = async (data: {
  model_size: string
  transcriber_type?: string
}) => {
  return await request.post('/transcriber_delete', data)
}
