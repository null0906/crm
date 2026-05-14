import type { PipelineType } from './types';

export function isDeliveryPipeline(pipelineType: PipelineType | string | null | undefined): boolean {
  return pipelineType === 'active_delivery' || pipelineType === 'compliance';
}
