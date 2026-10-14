const {
  EpsilonGreedyBandit,
  ThompsonSamplingBandit,
  sampleBeta,
  sampleGamma,
  sampleStandardNormal,
} = require('../../src/algo/bandit');

describe('Pure Multi-Armed Bandit (/algo/bandit.js)', () => {
  describe('Mathematical Samplers', () => {
    it('generates standard normal samples with finite mean and variance', () => {
      let sum = 0;
      const n = 1000;
      for (let i = 0; i < n; i++) {
        const val = sampleStandardNormal();
        expect(typeof val).toBe('number');
        expect(isNaN(val)).toBe(false);
        sum += val;
      }
      const mean = sum / n;
      expect(Math.abs(mean)).toBeLessThan(0.3); // Near 0
    });

    it('generates Gamma samples strictly positive', () => {
      for (let i = 0; i < 100; i++) {
        const g1 = sampleGamma(2.5);
        expect(g1).toBeGreaterThan(0);

        const gSmall = sampleGamma(0.5); // alpha < 1 branch
        expect(gSmall).toBeGreaterThan(0);
      }
    });

    it('generates Beta samples bounded in [0, 1]', () => {
      for (let i = 0; i < 100; i++) {
        const b = sampleBeta(2, 5);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('EpsilonGreedyBandit', () => {
    it('selects arms and records feedback with empirical CTR', () => {
      const bandit = new EpsilonGreedyBandit(['rail_trending', 'rail_recents'], {
        epsilon: 0.0, // Pure exploitation to test deterministic choice
      });

      // Initially with no clicks, picks first arm or equal
      bandit.recordFeedback('rail_trending', 1); // 1 click, 1 impression -> CTR 1.0
      bandit.recordFeedback('rail_recents', 0); // 0 clicks, 1 impression -> CTR 0.0

      expect(bandit.selectArm()).toBe('rail_trending');

      const stats = bandit.getStats();
      expect(stats.rail_trending.clicks).toBe(1);
      expect(stats.rail_trending.ctr).toBe(1.0);
      expect(stats.rail_recents.clicks).toBe(0);
      expect(stats.rail_recents.ctr).toBe(0);

      // Branch where arm has 0 impressions
      const freshBandit = new EpsilonGreedyBandit(['arm_fresh', 'arm_fresh2'], { epsilon: 0 });
      expect(freshBandit.getStats().arm_fresh.ctr).toBe(0);
      expect(freshBandit.selectArm()).toBe('arm_fresh');
    });

    it('explores randomly when epsilon is 1.0', () => {
      const bandit = new EpsilonGreedyBandit(['arm_a', 'arm_b', 'arm_c'], {
        epsilon: 1.0,
      });

      const selected = new Set();
      for (let i = 0; i < 50; i++) {
        selected.add(bandit.selectArm());
      }
      expect(selected.size).toBe(3);
    });

    it('decays exploration rate according to decay factor', () => {
      const bandit = new EpsilonGreedyBandit(['arm_1', 'arm_2'], {
        epsilon: 0.5,
        decay: 0.9,
        minEpsilon: 0.1,
      });

      bandit.selectArm();
      expect(bandit.epsilon).toBeCloseTo(0.45, 2);
    });

    it('handles empty arms list safely', () => {
      const emptyBandit = new EpsilonGreedyBandit([]);
      expect(emptyBandit.selectArm()).toBeNull();
    });
  });

  describe('ThompsonSamplingBandit', () => {
    it('accepts custom prior options', () => {
      const bandit = new ThompsonSamplingBandit(['custom_arm'], {
        priorAlpha: 5,
        priorBeta: 10,
      });
      const stats = bandit.getStats();
      expect(stats.custom_arm.alpha).toBe(5);
      expect(stats.custom_arm.beta).toBe(10);
    });

    it('updates Beta posterior parameters upon feedback', () => {
      const bandit = new ThompsonSamplingBandit(['hero_a', 'hero_b']);

      // 10 clicks on hero_a
      for (let i = 0; i < 10; i++) {
        bandit.recordFeedback('hero_a', true);
      }

      // 10 non-clicks on hero_b
      for (let i = 0; i < 10; i++) {
        bandit.recordFeedback('hero_b', false);
      }

      const stats = bandit.getStats();
      expect(stats.hero_a.alpha).toBe(11);
      expect(stats.hero_a.beta).toBe(1);
      expect(stats.hero_b.alpha).toBe(1);
      expect(stats.hero_b.beta).toBe(11);

      expect(stats.hero_a.expectedCtr).toBeGreaterThan(stats.hero_b.expectedCtr);
    });

    it('ranks arms by sampled score and expected CTR', () => {
      const bandit = new ThompsonSamplingBandit(['arm_top', 'arm_low']);
      for (let i = 0; i < 20; i++) {
        bandit.recordFeedback('arm_top', true);
        bandit.recordFeedback('arm_low', false);
      }

      const ranked = bandit.rankArms();
      expect(ranked.length).toBe(2);
      expect(ranked[0].armId).toBe('arm_top');
      expect(ranked[0].expectedCtr).toBeGreaterThan(ranked[1].expectedCtr);
    });

    it('selects the highest sampled arm using selectArm()', () => {
      const bandit = new ThompsonSamplingBandit(['arm_top', 'arm_low']);
      for (let i = 0; i < 30; i++) {
        bandit.recordFeedback('arm_top', true);
        bandit.recordFeedback('arm_low', false);
      }
      expect(bandit.selectArm()).toBe('arm_top');
    });

    it('exercises gamma distribution with small alphas and sample loops', () => {
      const { sampleGamma } = require('../../src/algo/bandit');
      for (let i = 0; i < 1500; i++) {
        const val = sampleGamma(0.3);
        expect(val).toBeGreaterThan(0);
      }
    });

    it('handles empty bandit safely', () => {
      const empty = new ThompsonSamplingBandit([]);
      expect(empty.selectArm()).toBeNull();
      expect(empty.rankArms()).toEqual([]);

      // Test zero-arg constructors
      const noArgEG = new EpsilonGreedyBandit();
      expect(noArgEG.selectArm()).toBeNull();
      const noArgTS = new ThompsonSamplingBandit();
      expect(noArgTS.selectArm()).toBeNull();
    });
  });
});
