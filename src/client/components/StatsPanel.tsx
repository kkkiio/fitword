import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchStats } from '../api';
import { useKnowledgeLabels, useFormatLabels } from '../hooks/use-knowledge-labels';

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span>{value ?? 0}%</span>
      </div>
      <Progress value={value ?? 0} />
    </div>
  );
}

function StatsRows({ title, rows, nameKey, highlight }: { title: string; rows: any[]; nameKey: string; highlight?: string }) {
  const { t } = useLingui();
  const knowledgeLabels = useKnowledgeLabels();
  const formatLabels = useFormatLabels();
  const labels: Record<string, string> = { ...knowledgeLabels, ...formatLabels };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground"><Trans>暂无数据，完成练习后会显示。</Trans></p> : null}
        {rows.map((row) => (
          <div key={row[nameKey]} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">{labels[row[nameKey]] ?? row[nameKey]}</div>
              {highlight === row[nameKey] ? <Badge variant="destructive"><Trans>优先打磨</Trans></Badge> : null}
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <Metric label={t`可用率`} value={row.usable_rate} />
              <Metric label={t`优质率`} value={row.good_rate} />
              <Metric label={t`待打磨率`} value={row.needs_work_rate} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StatsPanel() {
  const { t } = useLingui();
  const [stats, setStats] = useState<any>();

  useEffect(() => {
    fetchStats().then(setStats);
  }, []);

  if (!stats) return <main className="grid flex-1 place-items-center text-muted-foreground"><Trans>加载统计中…</Trans></main>;

  const rows = [...stats.weak_types];
  const weakest = rows[0]?.knowledge_type;

  return (
    <main className="flex-1 overflow-auto p-6">
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
        <StatsRows title={t`薄弱类型分布`} rows={rows} nameKey="knowledge_type" highlight={weakest} />
        <StatsRows title={t`选择题 vs 填空题`} rows={stats.format_comparison} nameKey="format" />
        <Card>
          <CardHeader>
            <CardTitle><Trans>写作评分</Trans></CardTitle>
            <CardDescription><Trans>总记录 {stats.writing_summary.total_records} 次</Trans></CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground"><Trans>平均总分：{stats.writing_summary.average_total_score ?? 0}</Trans></CardContent>
        </Card>
      </div>
    </main>
  );
}
