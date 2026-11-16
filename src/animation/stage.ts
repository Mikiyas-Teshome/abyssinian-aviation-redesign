/**
 * Shared, mutable state between the scroll rig (DOM) and the WebGL engine.
 * Time is measured in acts: 0 is the top of the hero, 1 the top of the second
 * act, and so on. The rig publishes `u`; the engine eases towards it.
 */
export const ACTS = [
  { id: 'hero', anchor: 'top', label: 'Departure', len: 2 },
  { id: 'journeys', anchor: 'journeys', label: 'Two journeys', len: 2.6 },
  { id: 'charter', anchor: 'charter', label: 'Charter', len: 2.6 },
  { id: 'medevac', anchor: 'medevac', label: 'Medical evacuation', len: 2.6 },
  { id: 'cargo', anchor: 'cargo', label: 'Cargo', len: 2.6 },
  { id: 'destinations', anchor: 'destinations', label: 'Destinations', len: 3 },
  { id: 'academy', anchor: 'academy', label: 'Aviation academy', len: 2.4 },
  { id: 'pathway', anchor: 'pathway', label: 'Training pathway', len: 6 },
  { id: 'environment', anchor: 'training-environment', label: 'Training environment', len: 4 },
  { id: 'trust', anchor: 'trust', label: 'Trust', len: 3.4 },
  { id: 'enquire', anchor: 'enquire', label: 'Enquire', len: 0 },
] as const;

export type ActId = (typeof ACTS)[number]['id'];

type Listener = (p: number) => void;

export const stage = {
  /** Act time, 0 … ACTS.length. */
  u: 0,
  /** True when sections are tall, pinned and scrubbed; false for the flat document. */
  immersive: false,
  reduced: false,
  selectedDestination: null as string | null,
  /** Local progress (0…1) of each act, for scroll-driven sub-steps. */
  progress: {} as Record<string, number>,
  listeners: {} as Record<string, Set<Listener>>,
  /** Set by the engine: ask for the DOM anchors to be re-collected. */
  refreshAnchors: null as (() => void) | null,
};

export function publishProgress(id: string, p: number) {
  if (stage.progress[id] === p) return;
  stage.progress[id] = p;
  stage.listeners[id]?.forEach((l) => l(p));
}

export function onProgress(id: string, cb: Listener) {
  (stage.listeners[id] ??= new Set()).add(cb);
  if (stage.progress[id] !== undefined) cb(stage.progress[id]);
  return () => {
    stage.listeners[id]?.delete(cb);
  };
}
