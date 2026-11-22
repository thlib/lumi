# SPA performance comparison

Generated 2026-11-22T18:52:59.369Z on linux 7.0.0-43-generic, Node v24.19.0,
Chromium 149.0.7827.55. Lower timing and size values are better.

## Results

First render, FCP, and update timing cells show the median, with p95 in
parentheses, across 5 cache-disabled samples.

| Framework | First render ms | FCP ms | Route ms/update | Filter ms/update | Tasks >10 ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lumi native 0.2.0 | 65.4 (73.3) | 180.0 (180.0) | 0.595 (0.678) | 0.068 (0.074) | 1 / 20.8 | 218 | 0 |
| Lumi build 0.2.0 | 53.7 (54.8) | 168.0 (180.0) | 0.647 (0.727) | 0.065 (0.067) | 1 / 20.6 | 208 | 0 |
| Lumi data-attribute DSL 0.2.0 | 62.7 (67.2) | 172.0 (180.0) | 1.202 (1.354) | 0.319 (0.329) | 2 / 105.9 | 578 | 0 |
| Vue 3.5.46 | 68.1 (74.5) | 184.0 (192.0) | 1.442 (1.569) | 0.137 (0.153) | 1 / 43.0 | 197 | 0 |
| React 19.3.1 | 100.6 (102.2) | 212.0 (216.0) | 1.835 (1.872) | 0.262 (0.313) | 2 / 94.7 | 197 | 0 |
| Lit 3.3.3 | 84.5 (90.5) | 180.0 (188.0) | 1.216 (1.239) | 0.157 (0.172) | 1 / 47.8 | 197 | 0 |
| Angular 22.3.0 | 82.8 (90.3) | 184.0 (216.0) | 1.614 (2.051) | 1.730 (1.762) | 1 / 17.1 | 200 | 0 |

## 20k-row filter

This separate workload renders all 20,000 deterministic records without
virtualization, then filters between two 5,000-row groups and the complete
dataset. It uses 2 fresh-browser samples per framework to
bound the workload's memory use.

| Framework | Record filter ms/update | Relative to Lumi build |
| --- | ---: | ---: |
| Lumi native 0.2.0 | 14.4 (15.3) | 0.94× |
| Lumi build 0.2.0 | 15.3 (17.7) | 1.00× |
| Lumi data-attribute DSL 0.2.0 | 16.6 (18.4) | 1.09× |
| Vue 3.5.46 | 37.3 (37.9) | 2.45× |
| React 19.3.1 | 49.4 (50.0) | 3.24× |
| Lit 3.3.3 | 1185.2 (1186.5) | 77.64× |
| Angular 22.3.0 | 382.9 (390.9) | 25.08× |

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
| Lumi native | 5 | 101.6 KiB | 27.1 KiB |
| Lumi build | 3 | 90.3 KiB | 26.1 KiB |
| Lumi data-attribute DSL | 3 | 110.5 KiB | 31.0 KiB |
| Vue | 4 | 114.5 KiB | 41.1 KiB |
| React | 4 | 267.6 KiB | 82.1 KiB |
| Lit | 4 | 67.5 KiB | 21.7 KiB |
| Angular | 3 | 168.4 KiB | 54.8 KiB |

## Relative to Lumi build

Values below 1.00× are lower than Lumi build; values above 1.00× are higher.

| Framework | First render | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1.22× | 0.92× | 1.05× | 1.04× |
| Lumi build | 1.00× | 1.00× | 1.00× | 1.00× |
| Lumi data-attribute DSL | 1.17× | 1.86× | 4.88× | 1.19× |
| Vue | 1.27× | 2.23× | 2.10× | 1.58× |
| React | 1.87× | 2.83× | 4.02× | 3.14× |
| Lit | 1.57× | 1.88× | 2.41× | 0.83× |
| Angular | 1.54× | 2.49× | 26.48× | 2.10× |

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
| Lumi native | 1000 | 1500 | 0 to 0 | +196.8 KiB |
| Lumi build | 1000 | 1500 | 0 to 0 | +195.2 KiB |
| Lumi data-attribute DSL | 1000 | 1500 | 0 to 0 | +220.3 KiB |
| Vue | 1000 | 1500 | 0 to 0 | +350.2 KiB |
| React | 1000 | 1500 | 0 to 0 | +418.8 KiB |
| Lit | 1000 | 1500 | 0 to 0 | +213.2 KiB |
| Angular | 1000 | 1500 | 0 to 0 | +583.7 KiB |

## Reading the result

- Lumi build recorded the lowest median first-render time
  (53.7 ms).
- Lumi native recorded the lowest median route-update time
  (0.595 ms/update).
- Lumi build recorded the lowest median project-filter time
  (0.065 ms/update).
- Lumi native recorded the lowest median 20k-row filter time
  (14.4 ms/update).
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
