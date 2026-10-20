const { SegmentTree } = require('../../src/algo/segmentTree');

describe('segmentTree.js pure data structure', () => {
  describe('constructor initialization', () => {
    it('initializes from an array of capacities', () => {
      const tree = new SegmentTree([10, 5, 8, 12]);
      expect(tree.n).toBe(4);
      expect(tree.getAllCapacities()).toEqual([10, 5, 8, 12]);
      expect(tree.queryMin(0, 3)).toBe(5);
      expect(tree.querySum(0, 3)).toBe(35);
    });

    it('initializes from a size count with default capacity', () => {
      const tree = new SegmentTree(5, 20);
      expect(tree.n).toBe(5);
      expect(tree.getAllCapacities()).toEqual([20, 20, 20, 20, 20]);
      expect(tree.querySum(0, 4)).toBe(100);
    });

    it('defaults to 24 slots with default capacity 15 when no arguments provided', () => {
      const tree = new SegmentTree();
      expect(tree.n).toBe(24);
      expect(tree.queryMin(0, 23)).toBe(15);
      expect(tree.querySum(0, 23)).toBe(24 * 15);
    });

    it('handles zero or invalid size by clamping to minimum 1', () => {
      const emptyTree = new SegmentTree([]);
      expect(emptyTree.n).toBe(0);
      const tree = new SegmentTree(0);
      expect(tree.n).toBe(24); // Number(0) falsy fallback to 24
      const treeNaN = new SegmentTree('not-a-number');
      expect(treeNaN.n).toBe(24);
    });
  });

  describe('queryMin and querySum range queries', () => {
    let tree;
    beforeEach(() => {
      tree = new SegmentTree([10, 20, 5, 15, 30, 25, 8, 12]);
    });

    it('queries exact minimum in sub-ranges', () => {
      expect(tree.queryMin(0, 7)).toBe(5);
      expect(tree.queryMin(0, 1)).toBe(10);
      expect(tree.queryMin(4, 5)).toBe(25);
      expect(tree.queryMin(6, 7)).toBe(8);
      expect(tree.queryMin(3, 3)).toBe(15);
    });

    it('handles inverted [R, L] bounds gracefully', () => {
      expect(tree.queryMin(7, 0)).toBe(5);
      expect(tree.querySum(7, 0)).toBe(125);
    });

    it('queries sum of capacities in sub-ranges', () => {
      expect(tree.querySum(0, 1)).toBe(30);
      expect(tree.querySum(2, 4)).toBe(5 + 15 + 30);
      expect(tree.querySum(0, 7)).toBe(125);
    });
  });

  describe('reserveSlot and releaseSlot', () => {
    let tree;
    beforeEach(() => {
      tree = new SegmentTree([10, 5, 2]);
    });

    it('successfully reserves capacity and updates tree', () => {
      expect(tree.reserveSlot(1, 3)).toBe(true);
      expect(tree.getCapacity(1)).toBe(2);
      expect(tree.queryMin(0, 2)).toBe(2);
      expect(tree.querySum(0, 2)).toBe(14);

      // Reserve with default count 1
      expect(tree.reserveSlot(1)).toBe(true);
      expect(tree.getCapacity(1)).toBe(1);
    });

    it('rejects reservation when capacity is insufficient', () => {
      expect(tree.reserveSlot(2, 5)).toBe(false);
      expect(tree.getCapacity(2)).toBe(2);
    });

    it('rejects reservation for invalid index or non-positive count', () => {
      expect(tree.reserveSlot(-1, 1)).toBe(false);
      expect(tree.reserveSlot(10, 1)).toBe(false);
      expect(tree.reserveSlot(1, 0)).toBe(false);
      expect(tree.reserveSlot(1, -2)).toBe(false);
    });

    it('successfully releases capacity and updates tree', () => {
      const newCap = tree.releaseSlot(2, 4);
      expect(newCap).toBe(6);
      expect(tree.getCapacity(2)).toBe(6);
      expect(tree.queryMin(0, 2)).toBe(5);

      // Release with default count 1
      expect(tree.releaseSlot(2)).toBe(7);
    });

    it('rejects release for invalid index or non-positive count', () => {
      expect(tree.releaseSlot(-1, 1)).toBe(0);
      expect(tree.releaseSlot(10, 1)).toBe(0);
      expect(tree.releaseSlot(1, 0)).toBe(0);
      expect(tree.releaseSlot(1, -5)).toBe(0);
    });

    it('getCapacity returns 0 for out-of-bounds queries', () => {
      expect(tree.getCapacity(-1)).toBe(0);
      expect(tree.getCapacity(99)).toBe(0);
    });
  });
});
