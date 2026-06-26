import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchStats } from '../api';
import { useKnowledgeLabels, useFormatLabels } from '../hooks/use-knowledge-labels';

export function StatsPanel() {
  const { t } = useLingui();
  const [stats, setStats] = useState<any>();
  const knowledgeLabels = useKnowledgeLabels();
  const formatLabels = useFormatLabels();
  const labels: Record<string, string> = { ...knowledgeLabels, ...formatLabels };

  useEffect(() => {
    fetchStats().then(setStats);
  }, []);

  if (!stats) return <div className="grid flex-1 place-items-center text-muted-foreground"><Trans>加载统计中…</Trans></div>;

  const rows = [...stats.weak_types];
  const weakest = rows[0]?.knowledge_type;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight"><Trans>练习统计</Trans></h2>
          <p className="text-muted-foreground"><Trans>只读展示本地 SQLite 中的练习质量分布。</Trans></p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            [t`总题数`, stats.overall.total],
            [t`可用率`, `${stats.overall.usable_rate}%`],
            [t`优质率`, `${stats.overall.good_rate}%`],
            [t`待打磨率`, `${stats.overall.needs_work_rate}%`],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
        {[
          [t`薄弱类型分布`, rows, 'knowledge_type', weakest],
          [t`选择题 vs 填空题`, stats.format_comparison, 'format', undefined],
        ].map(([title, tableRows, nameKey, highlight]) => (
          <Card key={title as string}>
            <CardHeader>
              <CardTitle>{title as string}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(tableRows as any[]).length === 0 ? <p className="text-sm text-muted-foreground"><Trans>暂无数据，完成练习后会显示。</Trans></p> : null}
              {(tableRows as any[]).map((row) => (
                <div key={row[nameKey as string]} className="rounded-lg border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-medium">{labels[row[nameKey as string]] ?? row[nameKey as string]}</div>
                    {highlight === row[nameKey as string] ? <Badge variant="destructive"><Trans>优先打磨</Trans></Badge> : null}
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                    {[
                      [t`可用率`, row.usable_rate],
                      [t`优质率`, row.good_rate],
                      [t`待打磨率`, row.needs_work_rate],
                    ].map(([label, value]) => (
                      <div key={label as string} className="space-y-1">
                        <div className="flex justify-between text-muted-foreground">
                          <span>{label as string}</span>
                          <span>{(value as number) ?? 0}%</span>
                        </div>
                        <Progress value={(value as number) ?? 0} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle><Trans>写作评分</Trans></CardTitle>
            <CardDescription><Trans>总记录 {stats.writing_summary.total_records} 次</Trans></CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground"><Trans>平均总分：{stats.writing_summary.average_total_score ?? 0}</Trans></CardContent>
        </Card>
      </div>
    </div>
  );
}
