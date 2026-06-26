import { Trans, useLingui } from '@lingui/react/macro';
import { BarChart3, Languages, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { SupportedLocale } from '../i18n';

export function Sidebar({
  locale,
  onLocaleChange,
  activeTab,
  onTabChange,
}: {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { t } = useLingui();

  return (
    <SidebarRoot>
      <SidebarHeader className="px-3 py-3">
        <div className="rounded-xl bg-sidebar-primary p-3 text-sidebar-primary-foreground">
          <h1 className="text-xl font-semibold">fitword</h1>
          <p className="text-xs opacity-80"><Trans>词感 · 表达练习</Trans></p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'chat'}
              onClick={() => onTabChange('chat')}
              tooltip={t`对话`}
            >
              <MessageSquareText className="size-4" />
              <span><Trans>对话</Trans></span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'stats'}
              onClick={() => onTabChange('stats')}
              tooltip={t`统计`}
            >
              <BarChart3 className="size-4" />
              <span><Trans>统计</Trans></span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2">
          <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
          <Button type="button" variant={locale === 'zh-CN' ? 'secondary' : 'ghost'} size="sm" aria-pressed={locale === 'zh-CN'} title={t`切换到中文`} onClick={() => onLocaleChange('zh-CN')}>
            中
          </Button>
          <Button type="button" variant={locale === 'en' ? 'secondary' : 'ghost'} size="sm" aria-pressed={locale === 'en'} title={t`切换到英文`} onClick={() => onLocaleChange('en')}>
            EN
          </Button>
        </div>
      </SidebarFooter>
    </SidebarRoot>
  );
}
