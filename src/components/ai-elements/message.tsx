import * as React from 'react';
import { cn } from '@/lib/utils';

function Message({ from, className, ...props }: React.ComponentProps<'article'> & { from: 'user' | 'assistant' }) {
  return <article data-slot="message" data-from={from} className={cn('flex w-full data-[from=user]:justify-end data-[from=assistant]:justify-start', className)} {...props} />;
}
function MessageContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="message-content" className={cn('max-w-[min(760px,90%)] rounded-2xl border bg-card px-4 py-3 text-card-foreground shadow-sm data-[from=user]:bg-primary data-[from=user]:text-primary-foreground', className)} {...props} />;
}
export { Message, MessageContent };
