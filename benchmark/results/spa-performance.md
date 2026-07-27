# SPA performance comparison

Generated 2026-07-27T18:00:50.978Z on linux 6.17.0-1030-oem, Node v24.14.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 32.6 (46.1) | 76.0 (96.0) | 0.340 (0.396) | 0.077 (0.079) | 1 / 23.3 | 218 | 0 |
| Lumi build 0.1.0 | 28.4 (30.2) | 72.0 (72.0) | 0.366 (0.404) | 0.077 (0.099) | 1 / 23.1 | 208 | 0 |
| Vue 3.5.40 | 9.4 (10.6) | 80.0 (80.0) | 0.516 (0.534) | 0.057 (0.058) | 1 / 17.4 | 197 | 0 |
| React 19.2.8 | 9.8 (10.6) | 92.0 (96.0) | 0.647 (0.685) | 0.114 (0.141) | 1 / 35.9 | 197 | 0 |
| Angular 21.2.18 | 37.3 (38.1) | 76.0 (80.0) | 0.660 (0.664) | 1.644 (1.650) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 14.7 (14.8) | 1.02× |
| Lumi build 0.1.0 | 14.4 (14.5) | 1.00× |
| Vue 3.5.40 | 15.9 (16.1) | 1.11× |
| React 19.2.8 | 21.7 (22.5) | 1.51× |
| Angular 21.2.18 | 166.4 (168.1) | 11.55× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 4 | 105.0 KiB | 27.0 KiB |
| Lumi build | 3 | 94.1 KiB | 26.3 KiB |
| Vue | 4 | 108.2 KiB | 39.3 KiB |
| React | 4 | 236.6 KiB | 73.3 KiB |
| Angular | 3 | 168.4 KiB | 55.2 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.15× | 0.93× | 1.00× | 1.02× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Vue | 0.33× | 1.41× | 0.75× | 1.50× |
| React | 0.35× | 1.76× | 1.48× | 2.79× |
| Angular | 1.31× | 1.80× | 21.45× | 2.10× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +276.9 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +275.9 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +365.2 KiB |
| React | 1000 | 1500 | 0 to 0 | +453.6 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +618.0 KiB |

## Reading the result

- Vue recorded the lowest median cold-load time
  (9.4 ms).
- Lumi native recorded the lowest median route-update time
  (0.340 ms/update).
- Vue recorded the lowest median project-filter time
  (0.057 ms/update).
- Lumi build recorded the lowest median 20k-row filter time
  (14.4 ms/update).
- Lumi build requested the smallest initial compressed asset set
  (26.3 KiB).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Built applications are rebuilt unless `--skip-build` is passed. Lumi native
  is served as its browser-loaded module graph; Lumi build is assembled and
  minified with esbuild.
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
