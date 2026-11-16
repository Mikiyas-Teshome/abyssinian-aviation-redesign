'use client';

import { useId } from 'react';
import { setQualityPreference, useQualityPreference, type QualityPreference } from '@/experience/quality';

/** Lets visitors choose a lighter experience. The choice persists across visits. */
export function QualityToggle() {
  const pref = useQualityPreference();
  const id = useId();
  return (
    <span className="quality">
      <label htmlFor={id}>Visual quality</label>
      <select id={id} value={pref} onChange={(e) => setQualityPreference(e.target.value as QualityPreference)}>
        <option value="auto">Automatic</option>
        <option value="high">Full 3D</option>
        <option value="balanced">Balanced 3D</option>
        <option value="lite">Lite (no 3D)</option>
      </select>
    </span>
  );
}
