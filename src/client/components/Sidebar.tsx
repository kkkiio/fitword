import { Trans, useLingui } from '@lingui/react/macro';
import { Archive, BarChart3, MessageSquareText, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatSession, WorkspaceView } from '../types';
import type { SupportedLocale } from '../i18n';

export function Sidebar({
  sessions,
  selectedSessionId,
  locale,
  onLocaleChange,
  activeView,
  onViewChange,
  onSessionCreate,
  onSessionArchive,
  onSessionSelect,
}: {
  sessions: ChatSession[];
  selectedSessionId?: string;
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  onSessionCreate: () => void;
  onSessionArchive: (sessionId: string) => void;
  onSessionSelect: (sessionId: string) => void;
}) {
  const { t } = useLingui();

  return (
    <SidebarRoot>
      <SidebarHeader className="px-3 py-3">
        <div className="rounded-lg bg-sidebar-primary p-3 text-sidebar-primary-foreground">
          <h1 className="text-xl font-semibold">fitword</h1>
          <p className="text-xs opacity-80">
            <Trans>词感 · 表达练习</Trans>
          </p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <MessageSquareText className="mr-2 size-4" />
            <span>
              <Trans>对话</Trans>
            </span>
          </SidebarGroupLabel>
          <SidebarGroupAction type="button" aria-label={t`新建对话`} title={t`新建对话`} onClick={onSessionCreate}>
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions.length === 0 ? (
                <SidebarMenuItem>
                  <div className="px-2 py-3 text-xs text-sidebar-foreground/60">
                    <Trans>暂无对话</Trans>
                  </div>
                </SidebarMenuItem>
              ) : null}
              {sessions.map((session) => (
                <SidebarMenuItem key={session.id}>
                  <SidebarMenuButton
                    isActive={activeView === 'chat' && selectedSessionId === session.id}
                    onClick={() => onSessionSelect(session.id)}
                    tooltip={session.title}
                  >
                    <MessageSquareText className="size-4" />
                    <span>{session.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    type="button"
                    showOnHover
                    aria-label={t`归档对话`}
                    title={t`归档对话`}
                    onClick={() => onSessionArchive(session.id)}
                  >
                    <Archive />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={activeView === 'stats'} onClick={() => onViewChange('stats')} tooltip={t`统计`}>
                  <BarChart3 className="size-4" />
                  <span>
                    <Trans>统计</Trans>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t`设置`} title={t`设置`} className="justify-self-start">
                  <Settings className="size-4" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">
              <Trans>设置</Trans>
            </TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <Trans>设置</Trans>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm font-medium">
                <Trans>界面语言</Trans>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={locale === 'zh-CN' ? 'secondary' : 'outline'}
                  aria-pressed={locale === 'zh-CN'}
                  onClick={() => onLocaleChange('zh-CN')}
                >
                  <Trans>中文</Trans>
                </Button>
                <Button
                  type="button"
                  variant={locale === 'en' ? 'secondary' : 'outline'}
                  aria-pressed={locale === 'en'}
                  onClick={() => onLocaleChange('en')}
                >
                  English
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarFooter>
    </SidebarRoot>
  );
}
