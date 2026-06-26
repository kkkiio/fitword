import { Trans } from '@lingui/react/macro';
import { MessageSquareText } from 'lucide-react';

export function WelcomeScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageSquareText className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-3xl font-semibold tracking-normal">fitword</h2>
        <p className="text-sm text-muted-foreground">
          <Trans>词感 · 表达练习</Trans>
        </p>
      </div>
    </div>
  );
}
