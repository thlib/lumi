// @ts-check

import {createReadStream} from 'node:fs'
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import {createServer} from 'node:http'
import {platform, release} from 'node:os'
import {dirname, extname, relative, resolve, sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {gzipSync} from 'node:zlib'
import {chromium} from '@playwright/test'

const root = resolve(import.meta.dirname, '..')

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   packageFile: string,
 *   buildDirectory: string | null,
 *   publicRoot: string,
 * }} Framework
 *
 * @typedef {{
 *   samples: number,
 *   routeCycles: number,
 *   filterCycles: number,
 *   build: boolean,
 *   output: string,
 *   jsonOutput: string,
 *   help: boolean,
 * }} Options
 *
 * @typedef {{
 *   domContentLoadedMs: number,
 *   firstContentfulPaintMs: number | null,
 *   loadMs: number,
 * }} StartupResult
 *
 * @typedef {{
 *   filterElapsedMs: number,
 *   filterMsPerUpdate: number,
 *   filterUpdates: number,
 *   finalHeapBytes: number | null,
 *   finalNodes: number,
 *   heapDeltaBytes: number | null,
 *   initialHeapBytes: number | null,
 *   initialNodes: number,
 *   blockingTaskCount: number,
 *   blockingTaskMaxMs: number,
 *   blockingTaskTotalMs: number,
 *   nodeDelta: number,
 *   routeElapsedMs: number,
 *   routeMsPerUpdate: number,
 *   routeUpdates: number,
 * }} StressResult
 *
 * @typedef {{
 *   resources: string[],
 *   startup: StartupResult,
 *   stress: StressResult,
 * }} SampleResult
 *
 * @typedef {{
 *   samples: Record<string, SampleResult[]>,
 *   resourceUrls: Record<string, Set<string>>,
 * }} BenchmarkResult
 *
 * @typedef {{
 *   count: number,
 *   max: number,
 *   median: number,
 *   min: number,
 *   p95: number,
 * }} Statistics
 *
 * @typedef {{
 *   domContentLoadedMs: Statistics,
 *   filterMsPerUpdate: Statistics,
 *   firstContentfulPaintMs: Statistics,
 *   heapDeltaBytes: Statistics,
 *   initialNodes: Statistics,
 *   loadMs: Statistics,
 *   blockingTaskCount: Statistics,
 *   blockingTaskMaxMs: Statistics,
 *   blockingTaskTotalMs: Statistics,
 *   nodeDelta: Statistics,
 *   routeMsPerUpdate: Statistics,
 * }} MetricSummary
 *
 * @typedef {{files: number, gzipBytes: number, rawBytes: number}} AssetSummary
 */

/** @type {readonly Framework[]} */
const frameworks = Object.freeze([
  {
    id: 'lumi',
    label: 'Lumi',
    packageFile: resolve(root, 'package.json'),
    buildDirectory: null,
    publicRoot: resolve(root, 'examples/spa'),
  },
  {
    id: 'react',
    label: 'React',
    packageFile: resolve(root, 'examples/framework-spa/react/package.json'),
    buildDirectory: resolve(root, 'examples/framework-spa/react'),
    publicRoot: resolve(root, 'examples/framework-spa/react/dist'),
  },
  {
    id: 'vue',
    label: 'Vue',
    packageFile: resolve(root, 'examples/framework-spa/vue/package.json'),
    buildDirectory: resolve(root, 'examples/framework-spa/vue'),
    publicRoot: resolve(root, 'examples/framework-spa/vue/dist'),
  },
  {
    id: 'angular',
    label: 'Angular',
    packageFile: resolve(root, 'examples/framework-spa/angular/package.json'),
    buildDirectory: resolve(root, 'examples/framework-spa/angular'),
    publicRoot: resolve(
      root,
      'examples/framework-spa/angular/dist/luminate-spa-angular/browser',
    ),
  },
])

const TASK_THRESHOLD_MS = 10

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
])

/** @type {Omit<Options, 'help'>} */
const defaultOptions = Object.freeze({
  samples: 5,
  routeCycles: 50,
  filterCycles: 100,
  build: true,
  output: resolve(root, 'benchmark/results/spa-performance.md'),
  jsonOutput: resolve(root, 'benchmark/results/spa-performance.json'),
})

async function main() {
  const options = parseArguments(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  if (options.build) {
    buildApplications()
  }

  await verifyApplications()

  const server = await startServer()
  const address = server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('Benchmark server did not expose a TCP port')
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
  })

  try {
    console.log(
      `Running ${options.samples} samples with `
      + `${options.routeCycles * 4} route and `
      + `${options.filterCycles * 3} filter updates per sample`,
    )

    const result = await runBenchmarks(
      browser,
      `http://127.0.0.1:${address.port}`,
      options,
    )
    const report = await createReport(result, options, await browser.version())

    await mkdir(dirname(options.output), {recursive: true})
    await mkdir(dirname(options.jsonOutput), {recursive: true})
    await Promise.all([
      writeFile(options.output, report.markdown),
      writeFile(options.jsonOutput, `${JSON.stringify(report.json, null, 2)}\n`),
    ])

    console.log(report.consoleSummary)
    console.log(`Markdown report: ${options.output}`)
    console.log(`JSON results: ${options.jsonOutput}`)
  } finally {
    await browser.close()
    await new Promise((resolveClose, rejectClose) => {
      server.close(error => error ? rejectClose(error) : resolveClose(undefined))
    })
  }
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} origin
 * @param {Options} options
 * @returns {Promise<BenchmarkResult>}
 */
async function runBenchmarks(browser, origin, options) {
  /** @type {Record<string, Array<Awaited<ReturnType<typeof runSample>>>>} */
  const samples = Object.fromEntries(
    frameworks.map(framework => [framework.id, []]),
  )
  /** @type {Record<string, Set<string>>} */
  const resourceUrls = Object.fromEntries(
    frameworks.map(framework => [framework.id, new Set()]),
  )

  // Rotate framework order on every pass to spread machine warm-up and drift.
  for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
    const ordered = [
      ...frameworks.slice(sampleIndex % frameworks.length),
      ...frameworks.slice(0, sampleIndex % frameworks.length),
    ]

    for (const framework of ordered) {
      process.stdout.write(
        `  sample ${sampleIndex + 1}/${options.samples}: `
        + `${framework.label.padEnd(7)} ... `,
      )
      const result = await runSample(
        browser,
        `${origin}/${framework.id}/?sample=${sampleIndex + 1}`,
        options,
      )
      recordValue(samples, framework.id).push(result)
      for (const url of result.resources) {
        recordValue(resourceUrls, framework.id).add(url)
      }
      console.log(
        `${result.startup.loadMs.toFixed(1)} ms load, `
        + `${result.stress.routeMsPerUpdate.toFixed(3)} ms/route, `
        + `${result.stress.filterMsPerUpdate.toFixed(3)} ms/filter`,
      )
    }
  }

  return {samples, resourceUrls}
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} url
 * @param {Options} options
 * @returns {Promise<SampleResult>}
 */
async function runSample(browser, url, options) {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport: {width: 1440, height: 1000},
  })
  const page = await context.newPage()
  const session = await context.newCDPSession(page)
  const taskTrace = createTaskTrace(session, TASK_THRESHOLD_MS)
  await session.send('Network.enable')
  await session.send('Network.setCacheDisabled', {cacheDisabled: true})
  await page.exposeFunction('__startBenchmarkTaskTrace', () => {
    return taskTrace.start()
  })
  await page.exposeFunction('__stopBenchmarkTaskTrace', () => {
    return taskTrace.stop()
  })

  /** @type {Error[]} */
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error))

  try {
    await page.goto(url, {waitUntil: 'load'})
    await page.waitForSelector('main h1', {state: 'visible'})
    await page.evaluate(() => new Promise(resolvePaint => {
      requestAnimationFrame(() => requestAnimationFrame(resolvePaint))
    }))
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          scroll-behavior: auto !important;
          transition: none !important;
        }
      `,
    })

    const startup = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]
      const paints = performance.getEntriesByType('paint')
      const firstContentfulPaint = paints.find(
        entry => entry.name === 'first-contentful-paint',
      )

      if (!(navigation instanceof PerformanceNavigationTiming)) {
        throw new Error('Navigation timing is unavailable')
      }

      return {
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
        loadMs: navigation.loadEventEnd,
      }
    })

    const stress = await page.evaluate(
      async ({routeCycles, filterCycles}) => {
        const routeTitles = {
          overview: 'Good morning, Freddy',
          projects: 'Projects',
          activity: 'Team activity',
          teams: 'Manage teams',
        }
        const routeSequence = /** @type {const} */ ([
          'projects',
          'activity',
          'teams',
          'overview',
        ])
        const filterSequence = /** @type {const} */ ([
          ['active', 2],
          ['planning', 2],
          ['all', 4],
        ])

        function visibleHeading() {
          return Array.from(document.querySelectorAll('main h1')).find(heading => {
            return heading.closest('[hidden]') === null
          })?.textContent?.trim()
        }

        /**
         * @param {() => boolean} predicate
         * @param {string} description
         */
        function waitFor(predicate, description) {
          if (predicate()) {
            return Promise.resolve()
          }

          return new Promise((resolveWait, rejectWait) => {
            const timeout = setTimeout(() => {
              observer.disconnect()
              rejectWait(new Error(`Timed out waiting for ${description}`))
            }, 5_000)
            const observer = new MutationObserver(() => {
              if (!predicate()) {
                return
              }

              clearTimeout(timeout)
              observer.disconnect()
              resolveWait(undefined)
            })
            observer.observe(document.documentElement, {
              attributes: true,
              childList: true,
              characterData: true,
              subtree: true,
            })
          })
        }

        /** @param {keyof typeof routeTitles} route */
        async function navigate(route) {
          const expectedTitle = routeTitles[route]
          const expectedHash = `#/${route}`
          if (location.hash !== expectedHash) {
            location.hash = expectedHash
          }
          await waitFor(
            () => visibleHeading() === expectedTitle,
            `route ${route}`,
          )
        }

        /**
         * @param {'active' | 'planning' | 'all'} value
         * @param {number} expectedCards
         */
        async function setFilter(value, expectedCards) {
          const button = Array.from(
            document.querySelectorAll('.filter-group button'),
          ).find(candidate => {
            return candidate.textContent?.trim().toLowerCase() === value
          })

          if (!(button instanceof HTMLButtonElement)) {
            throw new Error(`Could not find the "${value}" filter`)
          }
          const projectPage = button.closest('.page')
          if (projectPage === null) {
            throw new Error('The project filter is outside its page')
          }

          button.click()
          await waitFor(
            () => button.getAttribute('aria-pressed') === 'true'
              && projectPage.querySelectorAll('.project-card').length
                === expectedCards,
            `filter ${value}`,
          )
        }

        // Warm up JIT paths and framework schedulers before measuring.
        for (let index = 0; index < 2; index += 1) {
          for (const route of routeSequence) {
            await navigate(route)
          }
        }
        await navigate('projects')
        for (const [value, count] of filterSequence) {
          await setFilter(value, count)
        }
        await navigate('overview')

        globalThis.gc?.()
        const initialNodes = document.getElementsByTagName('*').length
        const browserPerformance = /** @type {
          Performance & {memory?: {usedJSHeapSize: number}}
        } */ (performance)
        const initialHeapBytes = browserPerformance.memory?.usedJSHeapSize ?? null
        const startTaskTrace = Reflect.get(
          globalThis,
          '__startBenchmarkTaskTrace',
        )
        const stopTaskTrace = Reflect.get(
          globalThis,
          '__stopBenchmarkTaskTrace',
        )
        if (
          typeof startTaskTrace !== 'function'
          || typeof stopTaskTrace !== 'function'
        ) {
          throw new Error('Benchmark task tracing is unavailable')
        }
        await Reflect.apply(startTaskTrace, globalThis, [])

        const routeStart = performance.now()
        for (let cycle = 0; cycle < routeCycles; cycle += 1) {
          for (const route of routeSequence) {
            await navigate(route)
          }
        }
        const routeElapsedMs = performance.now() - routeStart

        await navigate('projects')
        const filterStart = performance.now()
        for (let cycle = 0; cycle < filterCycles; cycle += 1) {
          for (const [value, count] of filterSequence) {
            await setFilter(value, count)
          }
        }
        const filterElapsedMs = performance.now() - filterStart
        const blockingTasks = /** @type {number[]} */ (
          await Reflect.apply(stopTaskTrace, globalThis, [])
        )

        await navigate('overview')
        await new Promise(resolveFrame => requestAnimationFrame(resolveFrame))
        globalThis.gc?.()

        const finalNodes = document.getElementsByTagName('*').length
        const finalHeapBytes = browserPerformance.memory?.usedJSHeapSize ?? null
        const routeUpdates = routeCycles * routeSequence.length
        const filterUpdates = filterCycles * filterSequence.length

        if (visibleHeading() !== routeTitles.overview) {
          throw new Error('Stress test finished in an invalid route state')
        }

        return {
          filterElapsedMs,
          filterMsPerUpdate: filterElapsedMs / filterUpdates,
          filterUpdates,
          finalHeapBytes,
          finalNodes,
          heapDeltaBytes: initialHeapBytes === null || finalHeapBytes === null
            ? null
            : finalHeapBytes - initialHeapBytes,
          initialHeapBytes,
          initialNodes,
          blockingTaskCount: blockingTasks.length,
          blockingTaskMaxMs: blockingTasks.length === 0
            ? 0
            : Math.max(...blockingTasks),
          blockingTaskTotalMs: blockingTasks.reduce(
            (total, duration) => total + duration,
            0,
          ),
          nodeDelta: finalNodes - initialNodes,
          routeElapsedMs,
          routeMsPerUpdate: routeElapsedMs / routeUpdates,
          routeUpdates,
        }
      },
      {
        routeCycles: options.routeCycles,
        filterCycles: options.filterCycles,
      },
    )

    if (pageErrors.length > 0) {
      throw new AggregateError(pageErrors, 'The SPA raised errors during testing')
    }

    const resources = await page.evaluate(() => [
      location.href,
      ...performance.getEntriesByType('resource').map(entry => entry.name),
    ])

    return {resources, startup, stress}
  } finally {
    await context.close()
  }
}

/**
 * @param {BenchmarkResult} result
 * @param {Options} options
 * @param {string} browserVersion
 */
async function createReport(result, options, browserVersion) {
  const packageDetails = await Promise.all(frameworks.map(async framework => {
    const packageJson = JSON.parse(await readFile(framework.packageFile, 'utf8'))
    const dependencyName = framework.id === 'lumi'
      ? null
      : framework.id === 'angular'
        ? '@angular/core'
        : framework.id
    const installedVersion = dependencyName === null
      ? packageJson.version
      : await readDependencyVersion(
        dirname(framework.packageFile),
        dependencyName,
      )
    if (typeof installedVersion !== 'string') {
      throw new Error(`Could not resolve the installed ${framework.label} version`)
    }
    return {
      ...framework,
      version: installedVersion,
    }
  }))
  const versions = Object.fromEntries(
    packageDetails.map(framework => [framework.id, framework.version]),
  )

  const assets = /** @type {Record<string, AssetSummary>} */ (Object.fromEntries(
    await Promise.all(frameworks.map(async framework => {
      const files = new Set()
      for (const resourceUrl of recordValue(
        result.resourceUrls,
        framework.id,
      )) {
        const file = mapUrlToFile(new URL(resourceUrl).pathname)
        if (file !== null && ['.css', '.html', '.js'].includes(extname(file))) {
          files.add(file)
        }
      }

      let rawBytes = 0
      let gzipBytes = 0
      for (const file of files) {
        const contents = await readFile(file)
        rawBytes += contents.byteLength
        gzipBytes += gzipSync(contents, {level: 9}).byteLength
      }

      return [framework.id, {
        files: files.size,
        gzipBytes,
        rawBytes,
      }]
    })),
  ))

  const summary = /** @type {Record<string, MetricSummary>} */ (
    Object.fromEntries(frameworks.map(framework => {
    const frameworkSamples = recordValue(result.samples, framework.id)
    return [framework.id, {
      domContentLoadedMs: summarize(frameworkSamples.map(
        sample => sample.startup.domContentLoadedMs,
      )),
      filterMsPerUpdate: summarize(frameworkSamples.map(
        sample => sample.stress.filterMsPerUpdate,
      )),
      firstContentfulPaintMs: summarize(frameworkSamples
        .map(sample => sample.startup.firstContentfulPaintMs)
        .filter(value => value !== null)),
      heapDeltaBytes: summarize(frameworkSamples
        .map(sample => sample.stress.heapDeltaBytes)
        .filter(value => value !== null)),
      initialNodes: summarize(frameworkSamples.map(
        sample => sample.stress.initialNodes,
      )),
      loadMs: summarize(frameworkSamples.map(
        sample => sample.startup.loadMs,
      )),
      blockingTaskCount: summarize(frameworkSamples.map(
        sample => sample.stress.blockingTaskCount,
      )),
      blockingTaskMaxMs: summarize(frameworkSamples.map(
        sample => sample.stress.blockingTaskMaxMs,
      )),
      blockingTaskTotalMs: summarize(frameworkSamples.map(
        sample => sample.stress.blockingTaskTotalMs,
      )),
      nodeDelta: summarize(frameworkSamples.map(
        sample => sample.stress.nodeDelta,
      )),
      routeMsPerUpdate: summarize(frameworkSamples.map(
        sample => sample.stress.routeMsPerUpdate,
      )),
    }]
  })))

  const generatedAt = new Date().toISOString()
  /** @param {keyof MetricSummary} metric */
  const winner = metric => {
    const ranked = [...frameworks].sort((left, right) => {
      return recordValue(summary, left.id)[metric].median
        - recordValue(summary, right.id)[metric].median
    })
    const first = ranked[0]
    if (first === undefined) {
      throw new Error('No benchmark frameworks are configured')
    }
    return first
  }
  const fastestLoad = winner('loadMs')
  const fastestRoute = winner('routeMsPerUpdate')
  const fastestFilter = winner('filterMsPerUpdate')
  const sizeRanking = [...frameworks].sort((left, right) => {
    return recordValue(assets, left.id).gzipBytes
      - recordValue(assets, right.id).gzipBytes
  })
  const smallest = sizeRanking[0]
  if (smallest === undefined) {
    throw new Error('No benchmark frameworks are configured')
  }

  const resultRows = frameworks.map(framework => {
    const values = recordValue(summary, framework.id)
    return `| ${framework.label} ${recordValue(versions, framework.id)} `
      + `| ${formatTiming(values.loadMs)} `
      + `| ${formatTiming(values.firstContentfulPaintMs)} `
      + `| ${formatTiming(values.routeMsPerUpdate, 3)} `
      + `| ${formatTiming(values.filterMsPerUpdate, 3)} `
      + `| ${formatNumber(values.blockingTaskCount.median, 0)} / `
      + `${formatNumber(values.blockingTaskTotalMs.median)} `
      + `| ${formatNumber(values.initialNodes.median, 0)} `
      + `| ${formatNumber(values.nodeDelta.median, 0)} |`
  }).join('\n')
  const assetRows = frameworks.map(framework => {
    const value = recordValue(assets, framework.id)
    return `| ${framework.label} | ${value.files} `
      + `| ${formatBytes(value.rawBytes)} | ${formatBytes(value.gzipBytes)} |`
  }).join('\n')
  const relativeRows = frameworks.map(framework => {
    const values = recordValue(summary, framework.id)
    const lumi = recordValue(summary, 'lumi')
    const frameworkAssets = recordValue(assets, framework.id)
    const lumiAssets = recordValue(assets, 'lumi')
    return `| ${framework.label} `
      + `| ${formatRatio(values.loadMs.median, lumi.loadMs.median)} `
      + `| ${formatRatio(
        values.routeMsPerUpdate.median,
        lumi.routeMsPerUpdate.median,
      )} `
      + `| ${formatRatio(
        values.filterMsPerUpdate.median,
        lumi.filterMsPerUpdate.median,
      )} `
      + `| ${formatRatio(
        frameworkAssets.gzipBytes,
        lumiAssets.gzipBytes,
      )} |`
  }).join('\n')
  const validationRows = frameworks.map(framework => {
    const frameworkSamples = recordValue(result.samples, framework.id)
    const nodeDeltas = frameworkSamples.map(sample => sample.stress.nodeDelta)
    const heap = recordValue(summary, framework.id).heapDeltaBytes
    return `| ${framework.label} `
      + `| ${options.samples * options.routeCycles * 4} `
      + `| ${options.samples * options.filterCycles * 3} `
      + `| ${Math.min(...nodeDeltas)} to ${Math.max(...nodeDeltas)} `
      + `| ${heap.count === 0 ? 'unavailable' : formatSignedBytes(heap.median)} |`
  }).join('\n')

  const markdown = `# SPA performance comparison

Generated ${generatedAt} on ${platform()} ${release()}, Node ${process.version},
Chromium ${browserVersion}. Lower timing and size values are better.

## Results

Load, FCP, and update timing cells show the median, with p95 in parentheses,
across ${options.samples} cache-disabled samples.

| Framework | Cold load ms | FCP ms | Route ms/update | Filter ms/update | Tasks >${TASK_THRESHOLD_MS} ms count / total ms | Initial DOM nodes | DOM node delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${resultRows}

## Initial asset footprint

These are the HTML, JavaScript, and CSS resources requested by the initial
overview route. Gzip is calculated per file at level 9 and represents a typical
compressed transfer, not the benchmark server's uncompressed transfer.

| Framework | Files | Raw | Gzip |
| --- | ---: | ---: | ---: |
${assetRows}

## Relative to Lumi

Values below 1.00× are lower than Lumi; values above 1.00× are higher.

| Framework | Cold load | Route update | Filter update | Gzip assets |
| --- | ---: | ---: | ---: | ---: |
${relativeRows}

## Stress validation

All measured operations verify the expected heading, selected filter, and
rendered project-card count before continuing. DOM and heap deltas compare the
same overview state after warmup and after the complete stress run.

| Framework | Route updates | Filter updates | DOM delta range | Median heap delta |
| --- | ---: | ---: | ---: | ---: |
${validationRows}

## Reading the result

- ${fastestLoad.label} recorded the lowest median cold-load time
  (${formatNumber(recordValue(summary, fastestLoad.id).loadMs.median)} ms).
- ${fastestRoute.label} recorded the lowest median route-update time
  (${formatNumber(
    recordValue(summary, fastestRoute.id).routeMsPerUpdate.median,
    3,
  )} ms/update).
- ${fastestFilter.label} recorded the lowest median project-filter time
  (${formatNumber(
    recordValue(summary, fastestFilter.id).filterMsPerUpdate.median,
    3,
  )} ms/update).
- ${smallest.label} requested the smallest initial compressed asset set
  (${formatBytes(recordValue(assets, smallest.id).gzipBytes)}).

Do not treat small differences as universal framework rankings. This suite
compares the repository's equivalent Luminate implementations, on one machine,
in headless Chromium. It includes framework scheduling and real DOM work but
does not simulate a network, user input delay, server rendering, hydration, or
application code splitting.

## Methodology

- Production React, Vue, and Angular bundles are rebuilt unless
  \`--skip-build\` is passed. Lumi is served as its native ES modules.
- Framework order rotates between samples. Browser HTTP cache is disabled.
- Every sample runs two unmeasured route cycles and one filter cycle to warm
  JIT and scheduler paths.
- A measured route cycle renders Projects → Activity → Teams → Overview.
- A measured filter cycle renders Active → Planning → All and verifies
  2 → 2 → 4 project cards.
- CSS transitions and animations are disabled; the viewport is 1440 × 1000
  with reduced motion enabled.
- Cold load is \`PerformanceNavigationTiming.loadEventEnd\`. Update timings are
  measured inside the page with \`performance.now()\`.
- Tasks >${TASK_THRESHOLD_MS} ms are complete Chromium renderer \`RunTask\`
  intervals captured through the DevTools timeline. Zero means that no
  individual main-thread task crossed the threshold, not that the run was
  incomplete. Heap deltas are measured after forced garbage collection and
  indicate retained memory for this workload, not a proven leak.
- Full samples, exact dependency versions, and environment metadata are
  available in the adjacent JSON report.
`

  const json = {
    generatedAt,
    environment: {
      browser: `Chromium ${browserVersion}`,
      node: process.version,
      os: `${platform()} ${release()}`,
      viewport: {height: 1000, width: 1440},
    },
    configuration: {
      filterCycles: options.filterCycles,
      filterUpdatesPerSample: options.filterCycles * 3,
      routeCycles: options.routeCycles,
      routeUpdatesPerSample: options.routeCycles * 4,
      samples: options.samples,
      taskThresholdMs: TASK_THRESHOLD_MS,
    },
    versions,
    assets,
    summary,
    samples: result.samples,
  }

  const consoleSummary = [
    '',
    'Median results',
    ...frameworks.map(framework => {
      const value = recordValue(summary, framework.id)
      const frameworkAssets = recordValue(assets, framework.id)
      return `  ${framework.label.padEnd(7)} `
        + `load ${formatNumber(value.loadMs.median).padStart(7)} ms | `
        + `route ${formatNumber(
          value.routeMsPerUpdate.median,
          3,
        ).padStart(7)} ms/update | `
        + `filter ${formatNumber(
          value.filterMsPerUpdate.median,
          3,
        ).padStart(7)} ms/update | `
        + `gzip ${formatBytes(frameworkAssets.gzipBytes)}`
    }),
  ].join('\n')

  return {consoleSummary, json, markdown}
}

/** @param {number[]} values @returns {Statistics} */
function summarize(values) {
  if (values.length === 0) {
    return {count: 0, median: 0, min: 0, p95: 0, max: 0}
  }

  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2
    : (sorted[midpoint] ?? 0)

  return {
    count: sorted.length,
    max: sorted[sorted.length - 1] ?? 0,
    median,
    min: sorted[0] ?? 0,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
  }
}

/**
 * @param {string} directory
 * @param {string} dependencyName
 */
async function readDependencyVersion(directory, dependencyName) {
  const lockfile = await readFile(
    resolve(root, 'pnpm-lock.yaml'),
    'utf8',
  )
  const importer = relative(root, directory) || '.'
  return readPnpmDependencyVersion(lockfile, importer, dependencyName)
}

/**
 * @param {string} lockfile
 * @param {string} importer
 * @param {string} dependencyName
 */
function readPnpmDependencyVersion(lockfile, importer, dependencyName) {
  const importerPattern = importer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dependencyPattern = dependencyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importerMatch = lockfile.match(new RegExp(
    `^ {2}['"]?${importerPattern}['"]?:\\n([\\s\\S]*?)(?=^ {2}[^\\s].*:\\n|^packages:)`,
    'm',
  ))
  const importerContents = importerMatch?.[1]
  if (importerContents === undefined) {
    return undefined
  }
  const match = importerContents.match(new RegExp(
    `^ {6}['"]?${dependencyPattern}['"]?:\\n`
      + `(?:^ {8}.*\\n)*?^ {8}version: ['"]?([^\\s'"(]+)`,
    'm',
  ))
  return match?.[1]
}

/**
 * Captures complete Chromium renderer tasks, including intervals below the
 * fixed 50 ms threshold exposed by the browser's Long Tasks API.
 *
 * @param {import('@playwright/test').CDPSession} session
 * @param {number} thresholdMs
 */
function createTaskTrace(session, thresholdMs) {
  let isActive = false

  return {
    async start() {
      if (isActive) {
        throw new Error('Benchmark task tracing is already active')
      }

      await session.send('Tracing.start', {
        categories: 'devtools.timeline,toplevel',
        transferMode: 'ReturnAsStream',
      })
      isActive = true
    },

    async stop() {
      if (!isActive) {
        throw new Error('Benchmark task tracing is not active')
      }

      const completed = new Promise(resolveComplete => {
        session.once('Tracing.tracingComplete', resolveComplete)
      })
      await session.send('Tracing.end')
      const details = /** @type {{stream?: string}} */ (await completed)
      const stream = details.stream

      if (stream === undefined) {
        throw new Error('Chromium task trace did not expose a data stream')
      }

      let traceJson = ''
      try {
        while (true) {
          const chunk = await session.send('IO.read', {handle: stream})
          traceJson += chunk.data

          if (chunk.eof === true) {
            break
          }
        }
      } finally {
        await session.send('IO.close', {handle: stream})
        isActive = false
      }

      const trace = /** @type {{traceEvents?: Array<{
       *   args?: {name?: string},
       *   dur?: number,
       *   name?: string,
       *   ph?: string,
       *   pid?: number,
       *   tid?: number,
       * }>}} */ (JSON.parse(traceJson))
      const thresholdMicroseconds = thresholdMs * 1_000
      const events = trace.traceEvents ?? []
      const rendererMainThreads = new Set(events
        .filter(event => {
          return event.name === 'thread_name'
            && event.ph === 'M'
            && event.args?.name === 'CrRendererMain'
        })
        .map(event => `${event.pid}:${event.tid}`))

      return events
        .filter(event => {
          return (
            event.name === 'RunTask'
            || event.name === 'ThreadControllerImpl::RunTask'
          )
            && event.ph === 'X'
            && typeof event.dur === 'number'
            && event.dur >= thresholdMicroseconds
            && rendererMainThreads.has(`${event.pid}:${event.tid}`)
        })
        .map(event => /** @type {number} */ (event.dur) / 1_000)
    },
  }
}

function buildApplications() {
  for (const framework of frameworks) {
    if (framework.buildDirectory === null) {
      continue
    }

    console.log(`Building ${framework.label} production application`)
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const build = spawnSync(pnpm, ['run', 'build'], {
      cwd: framework.buildDirectory,
      encoding: 'utf8',
      stdio: 'inherit',
    })

    if (build.error) {
      throw build.error
    }
    if (build.status !== 0) {
      throw new Error(`${framework.label} build exited with ${build.status}`)
    }
  }
}

async function verifyApplications() {
  for (const framework of frameworks) {
    await stat(resolve(framework.publicRoot, 'index.html'))
  }
}

/** @returns {Promise<import('node:http').Server>} */
function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const file = mapUrlToFile(url.pathname)

      if (file === null) {
        response.writeHead(404).end()
        return
      }

      const details = await stat(file)
      if (!details.isFile()) {
        response.writeHead(404).end()
        return
      }

      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': details.size,
        'content-type': contentTypes.get(extname(file))
          ?? 'application/octet-stream',
      })
      createReadStream(file).pipe(response)
    } catch {
      response.writeHead(404).end()
    }
  })

  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => resolveListen(server))
  })
}

/** @param {string} pathname */
function mapUrlToFile(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const match = /^\/(lumi|react|vue|angular)(?:\/(.*))?$/.exec(decoded)
  if (match !== null) {
    const framework = frameworks.find(candidate => candidate.id === match[1])
    if (framework === undefined) {
      return null
    }
    const relative = match[2] === undefined || match[2] === ''
      ? 'index.html'
      : match[2]
    return resolveInside(framework.publicRoot, relative)
  }

  if (decoded.startsWith('/src/')) {
    return resolveInside(root, decoded.slice(1))
  }

  return null
}

/** @param {string} directory @param {string} relative */
function resolveInside(directory, relative) {
  const file = resolve(directory, relative)
  return file === directory || file.startsWith(`${directory}${sep}`)
    ? file
    : null
}

/** @param {string[]} arguments_ @returns {Options} */
function parseArguments(arguments_) {
  /** @type {Options} */
  const options = {...defaultOptions, help: false}

  for (const argument of arguments_) {
    if (argument === '--skip-build') {
      options.build = false
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }

    const [name, value] = argument.split('=', 2)
    if (value === undefined) {
      throw new Error(`Expected --name=value, received "${argument}"`)
    }

    if (name === '--samples') {
      options.samples = parsePositiveInteger(name, value)
    } else if (name === '--route-cycles') {
      options.routeCycles = parsePositiveInteger(name, value)
    } else if (name === '--filter-cycles') {
      options.filterCycles = parsePositiveInteger(name, value)
    } else if (name === '--output') {
      options.output = resolve(process.cwd(), value)
    } else if (name === '--json-output') {
      options.jsonOutput = resolve(process.cwd(), value)
    } else {
      throw new Error(`Unknown option "${name}"`)
    }
  }

  return options
}

/** @param {string} name @param {string} value */
function parsePositiveInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function printHelp() {
  console.log(`Usage: pnpm run benchmark:spa [options]

Options:
  --samples=N          Cache-disabled samples per framework (default: 5)
  --route-cycles=N     Four route updates per cycle (default: 50)
  --filter-cycles=N    Three filter updates per cycle (default: 100)
  --skip-build         Use existing framework production bundles
  --output=PATH        Markdown report path
  --json-output=PATH   Raw JSON report path
  --help               Show this help`)
}

/** @param {Statistics} summary @param {number} [digits] */
function formatTiming(summary, digits = 1) {
  return `${formatNumber(summary.median, digits)} `
    + `(${formatNumber(summary.p95, digits)})`
}

/** @param {number} value @param {number} [digits] */
function formatNumber(value, digits = 1) {
  return Number(value).toFixed(digits)
}

/** @param {number} value @param {number} baseline */
function formatRatio(value, baseline) {
  return baseline === 0 ? 'n/a' : `${(value / baseline).toFixed(2)}×`
}

/** @param {number} bytes */
function formatBytes(bytes) {
  return bytes < 1024
    ? `${bytes} B`
    : `${(bytes / 1024).toFixed(1)} KiB`
}

/** @param {number} bytes */
function formatSignedBytes(bytes) {
  const sign = bytes > 0 ? '+' : ''
  return `${sign}${formatBytes(bytes)}`
}

/**
 * @template T
 * @param {Record<string, T>} record
 * @param {string} key
 * @returns {T}
 */
function recordValue(record, key) {
  const value = record[key]
  if (value === undefined) {
    throw new Error(`Missing benchmark record "${key}"`)
  }
  return value
}

await main()
