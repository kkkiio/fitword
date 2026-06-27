import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchStats } from '../api';
import { useFormatLabels } from '../hooks/use-knowledge-labels';

export function StatsPanel() {
  const { t } = useLingui();
  const [stats, setStats] = useState<any>();
  const formatLabels = useFormatLabels();

  useEffect(() => {
    fetchStats().then(setStats);
  }, []);

  if (!stats)
    return (
      <div className="grid flex-1 place-items-center text-muted-foreground">
        <Trans>加载统计中…</Trans>
      </div>
    );

  const hasAnswers = stats.overall.total > 0;
  const formatRows = stats.format_comparison as Array<{ format: string; total: number; good_rate: number }>;
  const writing = stats.writing_summary;
  const hasWriting = writing.total_records > 0;
  const dimensionRows = [
    [t`准确`, writing.average_accuracy],
    [t`具体`, writing.average_specificity],
    [t`自然`, writing.average_naturalness],
    [t`结构`, writing.average_structure],
    [t`语域`, writing.average_register],
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            <Trans>练习统计</Trans>
          </h2>
          <p className="text-muted-foreground">
            <Trans>轻量概览本地练习记录，帮助你判断是否需要继续练习。</Trans>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>答题概览</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>答题数量与整体优质率。</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAnswers ? (
              <p className="text-sm text-muted-foreground">
                <Trans>暂无答题数据，完成练习后会显示概览。</Trans>
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">
                    <Trans>总题数</Trans>
                  </div>
                  <div className="text-3xl font-semibold">{stats.overall.total}</div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      <Trans>优质率</Trans>
                    </span>
                    <span>{stats.overall.good_rate}%</span>
                  </div>
                  <Progress value={stats.overall.good_rate} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>选择 / 填空</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>按题型展示题数和优质率。</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasAnswers ? (
              <p className="text-sm text-muted-foreground">
                <Trans>暂无题型数据。</Trans>
              </p>
            ) : null}
            {formatRows.map((row) => (
              <div key={row.format} className="rounded-lg border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-medium">{formatLabels[row.format] ?? row.format}</div>
                  <div className="text-sm text-muted-foreground">
                    <Trans>{row.total} 题</Trans>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      <Trans>优质率</Trans>
                    </span>
                    <span>{row.good_rate}%</span>
                  </div>
                  <Progress value={row.good_rate} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>写作评分</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>展示五维平均分。</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasWriting ? (
              <p className="text-sm text-muted-foreground">
                <Trans>暂无写作评分数据，完成评分后会显示五维平均分。</Trans>
              </p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-sm text-muted-foreground">
                      <Trans>评分次数</Trans>
                    </div>
                    <div className="text-2xl font-semibold">{writing.total_records}</div>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-sm text-muted-foreground">
                      <Trans>平均总分</Trans>
                    </div>
                    <div className="text-2xl font-semibold">{writing.average_total_score}</div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-5">
                  {dimensionRows.map(([label, value]) => (
                    <div key={label as string} className="rounded-lg border bg-background p-3">
                      <div className="text-sm text-muted-foreground">{label as string}</div>
                      <div className="text-2xl font-semibold">{value as number}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
