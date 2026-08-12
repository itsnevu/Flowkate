import { describe, it, expect } from 'vitest';
import * as styles from '../styles';

const { sliderTrack, ...classRecipes } = styles;

/** The two colours the track gradient is built from, as spelled in the recipe. */
const FILL = '#1c1f24';
const REST = '#e6e9ee';

/** Percentages in gradient stop order, e.g. [0, 40, 40, 100]. */
function stops(fraction: number): number[] {
  const gradient = sliderTrack(fraction).background;
  return [...gradient.matchAll(/(\d+(?:\.\d+)?)%/g)].map(match => Number(match[1]));
}

describe('sliderTrack', () => {
  it('splits the track at the given fraction', () => {
    expect(stops(0.4)).toEqual([0, 40, 40, 100]);
  });

  it('is all rest colour at zero and all fill at one', () => {
    expect(stops(0)).toEqual([0, 0, 0, 100]);
    expect(stops(1)).toEqual([0, 100, 100, 100]);
  });

  // Temperature runs to 2 and is divided by 2 by the caller, so a stale value can arrive out of
  // range. Clamping is what stops the gradient from being emitted with a nonsensical stop.
  it('clamps out-of-range fractions instead of emitting an invalid gradient', () => {
    expect(stops(1.5)).toEqual([0, 100, 100, 100]);
    expect(stops(-0.5)).toEqual([0, 0, 0, 100]);
  });

  it('keeps the fill and rest colours either side of the split', () => {
    const gradient = sliderTrack(0.25).background;
    expect(gradient).toBe(`linear-gradient(to right, ${FILL} 0%, ${FILL} 25%, ${REST} 25%, ${REST} 100%)`);
  });

  it('never produces a stop before the previous one', () => {
    for (const fraction of [-1, 0, 0.001, 0.5, 0.999, 1, 2, Number.MAX_SAFE_INTEGER]) {
      const [start, split, resume, end] = stops(fraction);
      expect(start).toBeLessThanOrEqual(split);
      expect(split).toBe(resume);
      expect(resume).toBeLessThanOrEqual(end);
    }
  });
});

describe('class recipes', () => {
  // The design system is light-only by decision; a `dark:` variant reintroduces a mode that has
  // no tokens behind it and renders as unstyled.
  it('carry no dark-mode variants', () => {
    for (const [name, recipe] of Object.entries(classRecipes)) {
      expect(`${name}: ${recipe}`).not.toContain('dark:');
    }
  });

  it('are non-empty strings', () => {
    for (const recipe of Object.values(classRecipes)) {
      expect(typeof recipe).toBe('string');
      expect(recipe.trim()).not.toBe('');
    }
  });
});
