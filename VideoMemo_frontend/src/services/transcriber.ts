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
}

export const getTranscriberConfig = async (): Promise<TranscriberConfig> => {
  return await request.get('/transcriber_config')
}

export const updateTranscriberConfig = async (data: {
  transcriber_type: string
  whisper_model_size?: string
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
