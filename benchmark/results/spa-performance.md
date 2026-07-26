# SPA performance comparison

Generated 2026-07-26T19:46:24.968Z on linux 6.6.87.2-microsoft-standard-WSL2, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi 0.1.0 | 24.8 (31.5) | 76.0 (96.0) | 0.536 (0.625) | 0.105 (0.122) | 1 / 31.7 | 218 | 0 |
| React 19.2.8 | 10.2 (10.6) | 88.0 (88.0) | 0.733 (0.862) | 0.128 (0.183) | 1 / 38.9 | 197 | 0 |
| Vue 3.5.40 | 10.8 (11.5) | 80.0 (84.0) | 0.605 (0.667) | 0.078 (0.108) | 1 / 23.8 | 197 | 0 |
| Angular 21.2.18 | 29.7 (31.2) | 80.0 (80.0) | 0.713 (0.845) | 1.659 (1.662) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2
fresh-browser samples per framework to bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi |
| --- | ---: | ---: |
| Lumi 0.1.0 | 10.4 (11.6) | 1.00× |
| React 19.2.8 | 19.3 (19.4) | 1.86× |
| Vue 3.5.40 | 16.9 (18.8) | 1.63× |
| Angular 21.2.18 | 167.0 (170.0) | 16.06× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi | 3 | 103.2 KiB | 26.7 KiB |
| React | 4 | 235.3 KiB | 73.0 KiB |
| Vue | 4 | 106.4 KiB | 38.9 KiB |
| Angular | 3 | 167.2 KiB | 54.9 KiB |

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1.00× | 1.00× | 1.00× | 1.00× |
| React | 0.41× | 1.37× | 1.22× | 2.74× |
| Vue | 0.44× | 1.13× | 0.74× | 1.46× |
| Angular | 1.20× | 1.33× | 15.80× | 2.06× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi | 1000 | 1500 | 0 to 0 | +298.1 KiB |
| React | 1000 | 1500 | 0 to 0 | +440.8 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +358.5 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +605.8 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (10.2 ms).
- Lumi recorded the lowest median route-update time
  (0.536 ms/update).
- Vue recorded the lowest median project-filter time
  (0.078 ms/update).
- Lumi recorded the lowest median 20k-row filter time
  (10.4 ms/update).
- Lumi requested the smallest initial compressed asset set
  (26.7 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Every application is served from a production build, rebuilt unless
  `--skip-build` is passed. Lumi's example is bundled and minified with
  esbuild from the same unbundled source the repository serves directly.
- Framework order rotates between samples. Browser HTTP cache is disabled.
- Each framework sample uses a fresh browser process, bounding retained state
  from the intentionally large Records workload.
- Every sample runs two unmeasured route cycles and one filter cycle to warm
  JIT and scheduler paths.
- A measured route cycle renders Projects → Activity → Teams → Overview.
- A measured filter cycle renders Active → Planning → All and verifies
  2 → 2 → 4 project cards.
- A separate 20k-row cycle renders Alpha → Beta → All and verifies
  5,000 → 5,000 → 20,000 rows. It runs after the established DOM and
  heap stability measurements.
- CSS transitions and animations are disabled; the viewport is 1440 × 1000
  with reduced motion enabled.
- Cold load is `PerformanceNavigationTiming.loadEventEnd`. Update timings are
  measured inside the page with `performance.now()`.
- Tasks >10 ms are complete Chromium renderer `RunTask`
  intervals captured through the DevTools timeline. Zero means that no
  individual main-thread task crossed the threshold, not that the run was
  incomplete. Heap deltas are measured after forced garbage collection and
  indicate retained memory for this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
