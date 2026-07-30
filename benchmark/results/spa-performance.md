# SPA performance comparison

Generated 2026-07-30T20:30:49.579Z on linux 6.6.87.2-microsoft-standard-WSL2, Node v26.5.1,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across 5 cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.1.0 | 33.0 (38.4) | 84.0 (88.0) | 0.472 (0.489) | 0.084 (0.085) | 1 / 25.4 | 218 | 0 |
| Lumi build 0.1.0 | 28.5 (30.7) | 80.0 (84.0) | 0.464 (0.466) | 0.083 (0.085) | 1 / 25.1 | 208 | 0 |
| Lumi data-attribute DSL 0.1.0 | 31.4 (32.1) | 84.0 (84.0) | 0.617 (0.674) | 0.197 (0.202) | 1 / 59.3 | 586 | 0 |
| Vue 3.5.40 | 10.6 (13.5) | 84.0 (100.0) | 0.632 (0.712) | 0.073 (0.080) | 1 / 22.2 | 197 | 0 |
| React 19.2.8 | 10.2 (11.1) | 92.0 (96.0) | 0.722 (0.757) | 0.127 (0.128) | 1 / 38.4 | 197 | 0 |
| Lit 3.3.3 | 10.9 (14.3) | 88.0 (92.0) | 0.541 (0.587) | 0.077 (0.081) | 1 / 23.5 | 197 | 0 |
| Angular 21.2.18 | 34.4 (37.4) | 84.0 (84.0) | 0.680 (0.735) | 1.645 (1.664) | 0 / 0.0 | 199 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.1.0 | 13.0 (13.1) | 0.97× |
| Lumi build 0.1.0 | 13.3 (14.0) | 1.00× |
| Lumi data-attribute DSL 0.1.0 | 11.3 (11.5) | 0.85× |
| Vue 3.5.40 | 15.7 (16.0) | 1.18× |
| React 19.2.8 | 19.8 (22.4) | 1.49× |
| Lit 3.3.3 | 493.7 (505.7) | 37.12× |
| Angular 21.2.18 | 152.3 (153.6) | 11.45× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 111.7 KiB | 28.7 KiB |
| Lumi build | 3 | 100.4 KiB | 27.7 KiB |
| Lumi data-attribute DSL | 3 | 120.6 KiB | 32.5 KiB |
| Vue | 4 | 111.4 KiB | 39.9 KiB |
| React | 4 | 239.5 KiB | 73.7 KiB |
| Lit | 4 | 68.1 KiB | 21.8 KiB |
| Angular | 3 | 166.8 KiB | 54.0 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.16× | 1.02× | 1.01× | 1.04× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.10× | 1.33× | 2.38× | 1.17× |
| Vue | 0.37× | 1.36× | 0.88× | 1.44× |
| React | 0.36× | 1.55× | 1.54× | 2.66× |
| Lit | 0.38× | 1.17× | 0.94× | 0.79× |
| Angular | 1.21× | 1.46× | 19.90× | 1.95× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +272.7 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +271.6 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +227.4 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +345.1 KiB |
| React | 1000 | 1500 | 0 to 0 | +426.2 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +216.4 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +578.3 KiB |

## Reading the result

- React recorded the lowest median cold-load time
  (10.2 ms).
- Lumi build recorded the lowest median route-update time
  (0.464 ms/update).
- Vue recorded the lowest median project-filter time
  (0.073 ms/update).
- Lumi data-attribute DSL recorded the lowest median 20k-row filter time
  (11.3 ms/update).
- Lit requested the smallest initial compressed asset set
  (21.8 KiB).

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
