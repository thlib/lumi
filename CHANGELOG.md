# Changelog

## 0.3.1

- DOM property updates reuse their bookkeeping records to reduce allocations.
- Keyed lists with duplicate integer keys track each occurrence to avoid
  repeated scans. Each key still reuses DOM nodes in their original order.
- A full reversal of a keyed list skips the temporary arrays that Lumi uses
  for general reordering. A reversal of 20,000 rows saves 160,000 bytes of
  temporary storage.
- The SPA data-attribute DSL reuses the parsed path for repeated simple reads
  and reads single values without making a result array.

See the [SPA benchmark report](benchmark/results/spa-performance.md) for the
measurements that accompany these changes.
