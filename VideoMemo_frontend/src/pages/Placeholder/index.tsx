import { FC, JSX } from 'react'

interface IProps {
  title: string
  description: string
  icon: JSX.Element
}

const Placeholder: FC<IProps> = ({ title, description, icon }) => {
  return (
    <div className="flex h-screen flex-1 flex-col items-center justify-center bg-white text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
        {icon}
      </div>
      <div className="mt-4 text-2xl font-semibold text-gray-800">{title}</div>
      <div className="mt-2 max-w-md text-sm text-gray-500">{description}</div>
      <div className="mt-4 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-500">建设中</div>
    </div>
  )
}

export default Placeholder
