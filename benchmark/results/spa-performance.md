# SPA performance comparison

Generated 2026-07-24T18:58:19.674Z on linux 6.17.0-1028-oem, Node v22.12.0,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Each timing cell is the median, with p95 in parentheses, across
5 cache-disabled samples.

| Framework | Cold load ms | Route ms/update | Filter ms/update | Long tasks/sample | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lumi | 23.9 (28.1) | 1.383 (1.420) | 0.945 (0.983) | 1 | 0 |
| React | 7.3 (11.3) | 0.595 (0.609) | 0.070 (0.083) | 0 | 0 |
| Vue | 8.1 (9.0) | 0.475 (0.494) | 0.043 (0.048) | 0 | 0 |
| Angular | 19.6 (22.6) | 0.545 (0.604) | 1.647 (1.662) | 0 | 0 |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi | 16 | 178.5 KiB | 42.0 KiB |
| React | 4 | 233.0 KiB | 72.4 KiB |
| Vue | 4 | 104.1 KiB | 38.3 KiB |
| Angular | 3 | 164.6 KiB | 54.3 KiB |

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1.00× | 1.00× | 1.00× | 1.00× |
| React | 0.31× | 0.43× | 0.07× | 1.72× |
| Vue | 0.34× | 0.34× | 0.05× | 0.91× |
| Angular | 0.82× | 0.39× | 1.74× | 1.29× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1000 | 1500 | 0 to 0 | +187.3 KiB |
| React | 1000 | 1500 | 0 to 0 | +372.2 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +299.0 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +552.4 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (7.3 ms).
- Vue recorded the lowest median route-update time
  (0.475 ms/update).
- Vue recorded the lowest median project-filter time
  (0.043 ms/update).
- Vue requested the smallest initial compressed asset set
  (38.3 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Production React, Vue, and Angular bundles are rebuilt unless
  `--skip-build` is passed. Lumi is served as its native ES modules.
- Framework order rotates between samples. Browser HTTP cache is disabled.
- Every sample runs two unmeasured route cycles and one filter cycle to warm
  JIT and scheduler paths.
- A measured route cycle renders Projects → Activity → Teams → Overview.
- A measured filter cycle renders Active → Planning → All and verifies
  2 → 2 → 4 project cards.
- CSS transitions and animations are disabled; the viewport is 1440 × 1000
  with reduced motion enabled.
- Cold load is `PerformanceNavigationTiming.loadEventEnd`. Update timings are
  measured inside the page with `performance.now()`.
- Full samples and environment metadata are available in the adjacent JSON
  report.
