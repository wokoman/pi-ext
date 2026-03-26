/**
 * Simple LRU cache with a max-entry limit.
 * Uses a Map (insertion-ordered) — on get/set the entry is
 * moved to the end so the oldest entry is always first.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val === undefined) return undefined;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, val: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    while (this.map.size > this.maxSize) {
      // Delete oldest (first) entry
      const first = this.map.keys().next().value!;
      this.map.delete(first);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
