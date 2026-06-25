import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

function Conversation({ className, ...props }: React.ComponentProps<typeof ScrollArea>) {
  return <ScrollArea data-slot="conversation" className={cn('min-h-0 flex-1', className)} {...props} />;
}
function ConversationContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="conversation-content" className={cn('mx-auto flex w-full max-w-4xl flex-col gap-4 p-6', className)} {...props} />;
}
function ConversationEmpty({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="conversation-empty" className={cn('grid h-full place-items-center text-center text-muted-foreground', className)} {...props} />;
}
export { Conversation, ConversationContent, ConversationEmpty };
