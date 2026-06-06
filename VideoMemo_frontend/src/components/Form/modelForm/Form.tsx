import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useParams, useNavigate } from 'react-router-dom'
import { useProviderStore } from '@/store/providerStore'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { testConnection, deleteModelById } from '@/services/model.ts'
import { ModelSelector } from '@/components/Form/modelForm/ModelSelector.tsx'
import { X } from 'lucide-react'
import { useModelStore } from '@/store/modelStore'

// ✅ Provider表单schema
const ProviderSchema = z.object({
  name: z.string().min(2, '名称不能少于 2 个字符'),
  apiKey: z.string().optional(),
  baseUrl: z.string().url('必须是合法 URL'),
  type: z.string(),
})

type ProviderFormValues = z.infer<typeof ProviderSchema>

interface EnabledModel {
  id: number
  model_name: string
}

const ProviderForm = ({ isCreate = false }: { isCreate?: boolean }) => {
  let { id } = useParams()
  const navigate = useNavigate()
  const isEditMode = !isCreate

  const loadProviderById = useProviderStore(state => state.loadProviderById)
  const updateProvider = useProviderStore(state => state.updateProvider)
  const addNewProvider = useProviderStore(state => state.addNewProvider)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [isBuiltIn, setIsBuiltIn] = useState(false)
  const loadModelsById= useModelStore(state => state.loadModelsById)
  const loadModels = useModelStore(state => state.loadModels)
  const [models, setModels]= useState<EnabledModel[]>([])
  const providerForm = useForm<ProviderFormValues>({
    resolver: zodResolver(ProviderSchema),
    defaultValues: {
      name: '',
      apiKey: '',
      baseUrl: '',
      type: 'custom',
    },
  })

  useEffect(() => {

    const load = async () => {
      if (isEditMode) {

        const data = await loadProviderById(id!)
        providerForm.reset(data)
        setIsBuiltIn(data.type === 'built-in')
      } else {
        providerForm.reset({
          name: '',
          apiKey: '',
          baseUrl: '',
          type: 'custom',
        })
        setIsBuiltIn(false)
      }
      const models = await loadModelsById(id!)
      if(models){
        console.log('🔧 模型列表:', models)
        setModels(models)

      }
      setLoading(false)
    }
    load()
  }, [id])
  // 刷新「已启用模型」列表
  const refreshEnabledModels = async () => {
    const list = await loadModelsById(id!)
    if (list) setModels(list)
  }

  const handelDelete=async (modelId: number)=>{
    if (!window.confirm('确定要删除这个模型吗？')) return

    try {
      await deleteModelById(modelId)
      toast.success('删除成功')
      await refreshEnabledModels()
    } catch (e) {
      toast.error('删除异常')
    }
  }
  // 测试连通性
  const handleTest = async () => {
    const values = providerForm.getValues()
    if (!values.apiKey || !values.baseUrl) {
      toast.error('请填写 API Key 和 Base URL')
      return
    }
    try {
      if (!id){
        toast.error('请先保存供应商信息')
        return
      }
      setTesting(true)
     await testConnection({
             id
          })

        toast.success('测试连通性成功 🎉')

    } catch (error: any) {
      toast.error(`连接失败: ${error?.msg || '未知错误'}`)
      // toast.error('测试连通性异常')
    } finally {
      setTesting(false)
    }
  }

  // 保存Provider信息：保存成功后自动拉取模型列表，省去手动点「刷新模型」
  const onProviderSubmit = async (values: ProviderFormValues) => {
    if (isEditMode) {
      await updateProvider({ ...values, id: id! })
      toast.success('更新供应商成功')
      providerForm.reset(values) // 清除 dirty 状态
      loadModels(id!) // 用刚保存的 API Key 自动加载模型列表
    } else {
      const created = (await addNewProvider({ ...values })) as any
      toast.success('新增供应商成功')
      // 跳到编辑页：模型选择区随之出现并自动加载模型列表
      if (created?.id) navigate(`/settings/model/${created.id}`)
    }
  }

  if (loading) return <div className="p-4">加载中...</div>

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Provider信息表单 */}
      <Form {...providerForm}>
        <form
          onSubmit={providerForm.handleSubmit(onProviderSubmit)}
          className="flex max-w-xl flex-col gap-4"
        >
          <div className="text-lg font-bold">
            {isEditMode ? '编辑模型供应商' : '新增模型供应商'}
          </div>
          {!isBuiltIn && (
            <div className="text-sm text-red-500 italic">
              自定义模型供应商需要确保兼容 OpenAI SDK
            </div>
          )}
          <FormField
            control={providerForm.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex items-center gap-4">
                <FormLabel className="w-24 text-right">名称</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isBuiltIn} className="flex-1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={providerForm.control}
            name="apiKey"
            render={({ field }) => (
              <FormItem className="flex items-center gap-4">
                <FormLabel className="w-24 text-right">API Key</FormLabel>
                <FormControl>
                  <Input {...field} className="flex-1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={providerForm.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem className="flex items-center gap-4">
                <FormLabel className="w-24 text-right">API地址</FormLabel>
                <FormControl>
                  <Input {...field} className="flex-1" />
                </FormControl>
                <Button type="button" onClick={handleTest} variant="ghost" disabled={testing}>
                  {testing ? '测试中...' : '测试连通性'}
                </Button>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={providerForm.control}
            name="type"
            render={({ field }) => (
              <FormItem className="flex items-center gap-4">
                <FormLabel className="w-24 text-right">类型</FormLabel>
                <FormControl>
                  <Input {...field} disabled className="flex-1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-2">
            <Button type="submit" disabled={!providerForm.formState.isDirty}>
              {isEditMode ? '保存修改' : '保存创建'}
            </Button>
          </div>
        </form>
      </Form>

      {/* 模型选择：紧跟供应商表单（保存供应商后自动加载模型列表） */}
      {isEditMode && (
        <div className="flex max-w-xl flex-col gap-3">
          <div className="flex items-center gap-4">
            <span className="w-24 shrink-0 text-right text-sm font-medium">模型</span>
            <ModelSelector providerId={id!} onSaved={refreshEnabledModels} />
          </div>
          <div className="flex items-start gap-4">
            <span className="w-24 shrink-0 text-right text-sm font-medium">已启用</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {models && models.length > 0 ? (
                models.map(model => (
                  <span
                    key={model.id}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-sm text-blue-700"
                  >
                    {model.model_name}
                    <button
                      type="button"
                      onClick={() => handelDelete(model.id)}
                      className="hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-sm text-neutral-400">
                  暂无启用模型，从上方选择模型后点「保存模型」
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProviderForm
