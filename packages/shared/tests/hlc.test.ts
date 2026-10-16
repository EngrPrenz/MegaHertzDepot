import { describe, it, expect } from 'vitest';
import { HybridLogicalClock } from '../src/hlc.js';

describe('Hybrid Logical Clock (HLC)', () => {
  it('should generate monotonically increasing timestamps for local events', () => {
    const clock = new HybridLogicalClock('device-A');
    const t1 = clock.now(1000);
    const t2 = clock.now(1000); // same physical time
    const t3 = clock.now(1001); // physical time advanced

    expect(t1.millis).toBe(1000);
    expect(t1.counter).toBe(0);

    expect(t2.millis).toBe(1000);
    expect(t2.counter).toBe(1);

    expect(t3.millis).toBe(1001);
    expect(t3.counter).toBe(0);

    // Verify ordering
    expect(HybridLogicalClock.compare(t1, t2)).toBeLessThan(0);
    expect(HybridLogicalClock.compare(t2, t3)).toBeLessThan(0);
  });

  it('should advance when receiving a remote timestamp from the future', () => {
    const clock = new HybridLogicalClock('device-A');
    clock.now(1000);

    // Remote event at 1500:5:device-B
    const remote = { millis: 1500, counter: 5, nodeId: 'device-B' };
    const tReceived = clock.receive(remote, 1000);

    expect(tReceived.millis).toBe(1500);
    expect(tReceived.counter).toBe(6);
    expect(tReceived.nodeId).toBe('device-A');
  });

  it('should serialize and parse canonical format consistently', () => {
    const clock = new HybridLogicalClock('device-X');
    const ts = clock.now(1700000000000);
    const str = clock.toString();

    const parsed = HybridLogicalClock.parse(str);
    expect(parsed.millis).toBe(ts.millis);
    expect(parsed.counter).toBe(ts.counter);
    expect(parsed.nodeId).toBe('device-X');
  });

  it('should tie-break by nodeId when millis and counter are identical', () => {
    const hlc1 = { millis: 2000, counter: 0, nodeId: 'node-A' };
    const hlc2 = { millis: 2000, counter: 0, nodeId: 'node-B' };

    expect(HybridLogicalClock.compare(hlc1, hlc2)).toBeLessThan(0);
    expect(HybridLogicalClock.compare(hlc2, hlc1)).toBeGreaterThan(0);
  });
});
