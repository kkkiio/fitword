import { useLingui } from '@lingui/react/macro';

export function useKnowledgeLabels() {
  const { t } = useLingui();
  return {
    noun: t`名词`,
    verb: t`动词`,
    adjective: t`形容词`,
    logic: t`逻辑词`,
    domain: t`领域词`,
  } as Record<string, string>;
}

export function useFormatLabels() {
  const { t } = useLingui();
  return {
    choice: t`选择题`,
    fill: t`填空题`,
  } as Record<string, string>;
}
