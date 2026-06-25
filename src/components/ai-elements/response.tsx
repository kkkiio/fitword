import * as React from 'react';
import { cn } from '@/lib/utils';
function Response({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="response" className={cn('prose prose-sm max-w-none whitespace-pre-wrap leading-7 dark:prose-invert', className)} {...props} />; }
export { Response };
