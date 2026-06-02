import React, { FC, useRef, useState } from 'react'
import { PanelLeftClose, History as HistoryIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx'

import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from '@/components/ui/resizable'
import { ScrollArea } from "@/components/ui/scroll-area.tsx"
import type { ImperativePanelHandle } from 'react-resizable-panels'

interface IProps {
  Preview: React.ReactNode
  History: React.ReactNode
}

const HomeLayout: FC<IProps> = ({ Preview, History }) => {
  const [isMiddleCollapsed, setIsMiddleCollapsed] = useState(false)
  const middlePanelRef = useRef<ImperativePanelHandle>(null)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {/* 左侧历史 */}
        <ResizablePanel
          ref={middlePanelRef}
          defaultSize={22}
          minSize={12}
          maxSize={35}
          collapsible
          collapsedSize={0}
          onCollapse={() => setIsMiddleCollapsed(true)}
          onExpand={() => setIsMiddleCollapsed(false)}
        >
          <aside className="flex h-full flex-col overflow-hidden border-r border-neutral-200 bg-white">
            <header className="flex h-10 shrink-0 items-center justify-between border-b border-neutral-100 px-3">
              <span className="text-sm font-medium text-gray-600">笔记</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => middlePanelRef.current?.collapse()}
                      className="text-muted-foreground hover:text-primary cursor-pointer rounded p-1 hover:bg-neutral-100"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>收起历史</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </header>
            <ScrollArea className="flex-1 overflow-auto">
              <div>{History}</div>
            </ScrollArea>
          </aside>
        </ResizablePanel>

        <ResizableHandle />

        {/* 历史面板折叠时的展开按钮 */}
        {isMiddleCollapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => middlePanelRef.current?.expand()}
                  className="flex h-full w-8 shrink-0 items-center justify-center border-r border-neutral-200 bg-white hover:bg-neutral-50"
                >
                  <HistoryIcon className="h-4 w-4 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span>展开历史</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* 右边预览 */}
        <ResizablePanel defaultSize={78} minSize={30}>
          <main className="flex h-full flex-col overflow-hidden bg-white p-6">{Preview}</main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export default HomeLayout
