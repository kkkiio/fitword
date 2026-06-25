import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
function Tool({ className, ...props }: React.ComponentProps<typeof Card>) { return <Card data-slot="tool" className={cn('border-dashed bg-muted/30', className)} {...props} />; }
export { Tool };
