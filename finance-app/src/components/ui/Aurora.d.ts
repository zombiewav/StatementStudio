import type { FC } from 'react';

export interface AuroraProps {
  colorStops?: string[];
  blend?: number;
  amplitude?: number;
  speed?: number;
}

declare const Aurora: FC<AuroraProps>;
export default Aurora;
