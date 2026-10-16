export interface HlcTimestamp {
  millis: number;
  counter: number;
  nodeId: string;
}

/**
 * Hybrid Logical Clock (HLC)
 * Provides monotonic, causally consistent timestamps resilient to physical clock skew and drift.
 * Serializes into a canonical string format that supports lexicographical comparison.
 */
export class HybridLogicalClock {
  private millis: number;
  private counter: number;
  readonly nodeId: string;

  constructor(nodeId: string, initialMillis: number = 0, initialCounter: number = 0) {
    this.nodeId = nodeId;
    this.millis = initialMillis;
    this.counter = initialCounter;
  }

  /**
   * Generates a new timestamp for a local event.
   */
  public now(physicalTime: number = Date.now()): HlcTimestamp {
    if (physicalTime > this.millis) {
      this.millis = physicalTime;
      this.counter = 0;
    } else {
      this.counter += 1;
    }

    return {
      millis: this.millis,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Updates clock state upon receiving a remote timestamp (causality propagation).
   */
  public receive(remote: HlcTimestamp | string, physicalTime: number = Date.now()): HlcTimestamp {
    const remoteHlc = typeof remote === 'string' ? HybridLogicalClock.parse(remote) : remote;

    const maxMillis = Math.max(physicalTime, this.millis, remoteHlc.millis);

    if (maxMillis === this.millis && maxMillis === remoteHlc.millis) {
      this.counter = Math.max(this.counter, remoteHlc.counter) + 1;
    } else if (maxMillis === this.millis) {
      this.counter += 1;
    } else if (maxMillis === remoteHlc.millis) {
      this.counter = remoteHlc.counter + 1;
    } else {
      this.counter = 0;
    }

    this.millis = maxMillis;

    return {
      millis: this.millis,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Current HLC state as timestamp object.
   */
  public get state(): HlcTimestamp {
    return {
      millis: this.millis,
      counter: this.counter,
      nodeId: this.nodeId,
    };
  }

  /**
   * Current HLC state formatted as a canonical string.
   */
  public toString(): string {
    return HybridLogicalClock.format(this.state);
  }

  /**
   * Formats an HlcTimestamp into canonical lexicographically-sortable string:
   * ${paddedMillis}:${paddedCounter}:${nodeId}
   */
  public static format(hlc: HlcTimestamp): string {
    const paddedMillis = hlc.millis.toString().padStart(15, '0');
    const paddedCounter = hlc.counter.toString().padStart(6, '0');
    return `${paddedMillis}:${paddedCounter}:${hlc.nodeId}`;
  }

  /**
   * Parses a canonical HLC string into an HlcTimestamp.
   */
  public static parse(hlcString: string): HlcTimestamp {
    const parts = hlcString.split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid HLC string format: "${hlcString}"`);
    }

    const millis = parseInt(parts[0], 10);
    const counter = parseInt(parts[1], 10);
    const nodeId = parts.slice(2).join(':');

    if (isNaN(millis) || isNaN(counter)) {
      throw new Error(`Invalid HLC numerical components: "${hlcString}"`);
    }

    return { millis, counter, nodeId };
  }

  /**
   * Compares two HLC timestamps or strings.
   * Returns:
   *  < 0 if a < b
   *  > 0 if a > b
   *    0 if a === b
   */
  public static compare(a: HlcTimestamp | string, b: HlcTimestamp | string): number {
    const strA = typeof a === 'string' ? a : HybridLogicalClock.format(a);
    const strB = typeof b === 'string' ? b : HybridLogicalClock.format(b);

    if (strA < strB) return -1;
    if (strA > strB) return 1;
    return 0;
  }
}
