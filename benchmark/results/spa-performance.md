# SPA performance comparison

Generated 2026-11-23T19:58:43.760Z on linux 7.0.0-43-generic, Node v24.19.0,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

First render, FCP, and update timing cells show the median, with p95 in
parentheses, across 5 cache-disabled samples.

| Framework | First render ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.3.0 | 59.0 (72.5) | 188.0 (212.0) | 1.069 (1.607) | 0.102 (0.120) | 3 / 64.5 | 218 | 0 |
| Lumi build 0.3.0 | 41.4 (192.9) | 164.0 (680.0) | 0.918 (3.871) | 0.079 (0.100) | 2 / 40.8 | 208 | 0 |
| Lumi data-attribute DSL 0.3.0 | 54.1 (114.8) | 184.0 (324.0) | 2.179 (2.705) | 0.558 (0.764) | 2 / 206.6 | 556 | 0 |
| Vue 3.5.46 | 76.2 (95.7) | 204.0 (240.0) | 1.982 (2.038) | 0.151 (0.162) | 1 / 46.1 | 197 | 0 |
| React 19.3.1 | 109.3 (119.3) | 224.0 (244.0) | 2.375 (3.010) | 0.278 (0.358) | 2 / 102.6 | 197 | 0 |
| Lit 3.3.3 | 90.9 (102.6) | 204.0 (248.0) | 1.815 (1.966) | 0.198 (0.304) | 1 / 76.9 | 197 | 0 |
| Angular 22.3.0 | 88.9 (95.7) | 200.0 (232.0) | 2.231 (5.085) | 1.822 (4.066) | 1 / 19.3 | 200 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.3.0 | 16.3 (16.8) | 1.00× |
| Lumi build 0.3.0 | 16.2 (16.7) | 1.00× |
| Lumi data-attribute DSL 0.3.0 | 21.1 (22.7) | 1.30× |
| Vue 3.5.46 | 40.2 (40.7) | 2.48× |
| React 19.3.1 | 59.7 (66.8) | 3.68× |
| Lit 3.3.3 | 1289.2 (1289.2) | 79.41× |
| Angular 22.3.0 | 406.4 (408.0) | 25.03× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 6 | 100.1 KiB | 27.1 KiB |
| Lumi build | 3 | 87.5 KiB | 25.6 KiB |
| Lumi data-attribute DSL | 3 | 108.2 KiB | 30.6 KiB |
| Vue | 4 | 114.5 KiB | 41.1 KiB |
| React | 4 | 267.6 KiB | 82.1 KiB |
| Lit | 4 | 67.5 KiB | 21.7 KiB |
| Angular | 3 | 168.4 KiB | 54.8 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | First render | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.43× | 1.16× | 1.30× | 1.06× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.31× | 2.37× | 7.10× | 1.19× |
| Vue | 1.84× | 2.16× | 1.92× | 1.61× |
| React | 2.64× | 2.59× | 3.54× | 3.20× |
| Lit | 2.20× | 1.98× | 2.51× | 0.85× |
| Angular | 2.15× | 2.43× | 23.17× | 2.14× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +199.8 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +195.2 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +214.4 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +350.7 KiB |
| React | 1000 | 1500 | 0 to 0 | +411.0 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +221.9 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +581.6 KiB |

## Reading the result

- Lumi build recorded the lowest median first-render time
  (41.4 ms).
- Lumi build recorded the lowest median route-update time
  (0.918 ms/update).
- Lumi build recorded the lowest median project-filter time
  (0.079 ms/update).
- Lumi build recorded the lowest median 20k-row filter time
  (16.2 ms/update).
- Lit requested the smallest initial compressed asset set
  (21.7 KiB).

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
- First render is the time from navigation start until the application puts
  its first visible page heading into the document. A visible page heading is
  a `main h1` element that has text and is not inside a `[hidden]`
  element. Before the page scripts run, the harness installs a
  `MutationObserver`. The observer records `performance.now()` when its
  callback finds the first visible page heading. For each loading strategy,
  the value includes the download, parsing, and execution of the application
  code and the first render. The value does not include the paint. FCP shows
  the first paint.
- The report does not compare `DOMContentLoaded` or load event times. An
  application that starts from a dynamic `import()` can render after the
  load event. An application that starts in a `DOMContentLoaded` listener
  renders before the load event. Because of this, these event times include
  the first render for some applications and not for others. The JSON report
  keeps `PerformanceNavigationTiming.domContentLoadedEventEnd` and
  `loadEventEnd` as the raw `domContentLoadedMs` and `loadMs` values.
- Update timings are measured inside the page with `performance.now()`.
- Tasks >10 ms are complete Chromium renderer `RunTask`
  intervals captured through the DevTools timeline. Zero means that no
  individual main-thread task crossed the threshold, not that the run was
  incomplete. Heap deltas are measured after forced garbage collection and
  indicate retained memory for this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
