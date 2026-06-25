import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsContextValue = { value: string; onValueChange: (value: string) => void };
const TabsContext = React.createContext<TabsContextValue | null>(null);
function useTabs() { const context = React.useContext(TabsContext); if (!context) throw new Error('Tabs components must be used inside Tabs'); return context; }
function Tabs({ value, defaultValue, onValueChange, className, ...props }: React.ComponentProps<'div'> & { value?: string; defaultValue?: string; onValueChange?: (value: string) => void }) {
  const [inner, setInner] = React.useState(defaultValue ?? value ?? '');
  const current = value ?? inner;
  const setValue = (next: string) => { setInner(next); onValueChange?.(next); };
  return <TabsContext.Provider value={{ value: current, onValueChange: setValue }}><div data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} /></TabsContext.Provider>;
}
function TabsList({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="tabs-list" className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]', className)} {...props} />; }
function TabsTrigger({ value, className, ...props }: React.ComponentProps<'button'> & { value: string }) { const tabs = useTabs(); const active = tabs.value === value; return <button data-slot="tabs-trigger" data-state={active ? 'active' : 'inactive'} className={cn('data-[state=active]:bg-background data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm', className)} onClick={() => tabs.onValueChange(value)} {...props} />; }
function TabsContent({ value, className, ...props }: React.ComponentProps<'div'> & { value: string }) { const tabs = useTabs(); if (tabs.value !== value) return null; return <div data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />; }
export { Tabs, TabsList, TabsTrigger, TabsContent };
