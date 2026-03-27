import { describe, it, expect } from "vitest";
import { LRUCache } from "../../lru-cache.js";

describe("LRUCache", () => {
  it("get/set basics", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBe(2);
    expect(c.get("x")).toBeUndefined();
    expect(c.size).toBe(2);
  });

  it("evicts oldest when over capacity", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.set("d", 4); // evicts "a"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
    expect(c.get("d")).toBe(4);
    expect(c.size).toBe(3);
  });

  it("get promotes to most-recently-used", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.get("a"); // promote "a"
    c.set("d", 4); // should evict "b" (oldest after promotion)
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe(3);
    expect(c.get("d")).toBe(4);
  });

  it("set overwrites and promotes existing key", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.set("a", 10); // overwrite + promote
    c.set("d", 4); // evicts "b"
    expect(c.get("a")).toBe(10);
    expect(c.get("b")).toBeUndefined();
  });

  it("has() works without promoting", () => {
    const c = new LRUCache<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.has("a")).toBe(true);
    expect(c.has("x")).toBe(false);
  });

  it("delete() removes entry", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.delete("a")).toBe(true);
    expect(c.get("a")).toBeUndefined();
    expect(c.delete("x")).toBe(false);
    expect(c.size).toBe(1);
  });

  it("deleteByPrefix() removes matching entries", () => {
    const c = new LRUCache<string, number>(10);
    c.set("file:a", 1);
    c.set("file:b", 2);
    c.set("theme:x", 3);
    const count = c.deleteByPrefix("file:");
    expect(count).toBe(2);
    expect(c.size).toBe(1);
    expect(c.get("theme:x")).toBe(3);
  });

  it("clear() empties cache", () => {
    const c = new LRUCache<string, number>(3);
    c.set("a", 1);
    c.set("b", 2);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get("a")).toBeUndefined();
  });

  it("capacity of 1", () => {
    const c = new LRUCache<string, string>(1);
    c.set("a", "x");
    c.set("b", "y");
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("y");
    expect(c.size).toBe(1);
  });
});
