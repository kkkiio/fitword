import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function PromptInput({ className, ...props }: React.ComponentProps<'form'>) { return <form data-slot="prompt-input" className={cn('flex items-end gap-3 border-t bg-background/95 p-4 backdrop-blur', className)} {...props} />; }
function PromptInputTextarea(props: React.ComponentProps<typeof Textarea>) { return <Textarea data-slot="prompt-input-textarea" {...props} />; }
function PromptInputToolbar({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="prompt-input-toolbar" className={cn('flex items-center gap-2', className)} {...props} />; }
function PromptInputSubmit(props: React.ComponentProps<typeof Button>) { return <Button data-slot="prompt-input-submit" type="submit" {...props} />; }
export { PromptInput, PromptInputTextarea, PromptInputToolbar, PromptInputSubmit };
