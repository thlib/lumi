// @ts-check

// Static content and routing helpers shared by the Lumi SPA.
/** @typedef {'overview' | 'projects' | 'activity' | 'teams'} Route */
/** @typedef {'all' | 'active' | 'planning'} ProjectFilter */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   status: 'Active' | 'Planning',
 *   progress: number,
 *   due: string,
 *   accent: string,
 *   members: string,
 * }} Project
 */

/**
 * @typedef {{
 *   id: string,
 *   initials: string,
 *   tone: string,
 *   person: string,
 *   action: string,
 *   target: string,
 *   time: string,
 *   personId: string,
 * }} Activity
 */

/**
 * @typedef {{
 *   id: string,
 *   initials: string,
 *   tone: string,
 *   name: string,
 *   role: string,
 *   email: string,
 *   country: string,
 *   team: string,
 *   bio: string,
 * }} Member
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   value: string,
 *   change: string,
 *   direction: 'positive' | 'neutral',
 * }} Metric
 */

/**
 * @typedef {{
 *   id: string,
 *   message: string,
 * }} Toast
 */

/**
 * @typedef {{
 *   route: Route,
 *   navOpen: boolean,
 *   toasts: Toast[],
 *   selectedMemberId: string | null,
 *   filter: ProjectFilter,
 * }} AppState
 */

export const routeLabels = Object.freeze({
  overview: 'Overview',
  projects: 'Projects',
  activity: 'Activity',
  teams: 'Manage teams',
})

export const projects = Object.freeze([
  {
    id: 'atlas',
    name: 'Atlas mobile app',
    description: 'A focused mobile experience for field teams.',
    status: /** @type {const} */ ('Active'),
    progress: 72,
    due: 'Due Aug 14',
    accent: '#6c5ce7',
    members: 'AL · NB · FF',
  },
  {
    id: 'meridian',
    name: 'Meridian launch',
    description: 'Go-to-market planning for the autumn release.',
    status: /** @type {const} */ ('Planning'),
    progress: 34,
    due: 'Due Sep 02',
    accent: '#ef8354',
    members: 'ES · EN · +4',
  },
  {
    id: 'luminate',
    name: 'Luminate design system',
    description: 'Shared foundations for product and marketing.',
    status: /** @type {const} */ ('Active'),
    progress: 88,
    due: 'Due Jul 30',
    accent: '#2a9d8f',
    members: 'SB · BP · FK',
  },
  {
    id: 'signal',
    name: 'Signal research',
    description: 'Customer interviews and opportunity mapping.',
    status: /** @type {const} */ ('Planning'),
    progress: 18,
    due: 'Due Sep 18',
    accent: '#3a86ff',
    members: 'JB · TY · AC',
  },
])

export const activities = Object.freeze([
  {
    id: 'activity-1',
    initials: 'NB',
    tone: '#e8e4ff',
    person: 'Norm Barlug',
    action: 'reviewed',
    target: 'Multi-region wheat trial results',
    time: '6 minutes ago',
    personId: 'norm-barlug',
  },
  {
    id: 'activity-2',
    initials: 'JB',
    tone: '#fff0d9',
    person: 'Jaggi Boss',
    action: 'calibrated',
    target: 'Microwave semiconductor detector',
    time: '18 minutes ago',
    personId: 'jaggi-boss',
  },
  {
    id: 'activity-3',
    initials: 'FF',
    tone: '#ffe8de',
    person: 'Freddy Fraggin',
    action: 'taped out',
    target: 'Next-generation microprocessor',
    time: '31 minutes ago',
    personId: 'freddy-fraggin',
  },
  {
    id: 'activity-4',
    initials: 'FK',
    tone: '#e8f1ff',
    person: 'Fazlo Kan',
    action: 'optimized',
    target: 'Tubular high-rise load model',
    time: '54 minutes ago',
    personId: 'fazlo-kan',
  },
  {
    id: 'activity-5',
    initials: 'EN',
    tone: '#dff5f1',
    person: 'Emmy Nother',
    action: 'proved',
    target: 'Symmetry conservation framework',
    time: '1 hour ago',
    personId: 'emmy-nother',
  },
  {
    id: 'activity-6',
    initials: 'ES',
    tone: '#deedff',
    person: 'Erato Stenes',
    action: 'mapped',
    target: 'Planet-scale geodesy model',
    time: '2 hours ago',
    personId: 'erato-stenes',
  },
  {
    id: 'activity-7',
    initials: 'TY',
    tone: '#f1ecdd',
    person: 'Tutu Yoyo',
    action: 'validated',
    target: 'Plant-derived malaria program',
    time: 'Yesterday at 16:42',
    personId: 'tutu-yoyo',
  },
  {
    id: 'activity-8',
    initials: 'AC',
    tone: '#eee8fa',
    person: 'Alfredo Church',
    action: 'reduced',
    target: 'Lambda computation model',
    time: 'Yesterday at 14:10',
    personId: 'alfredo-church',
  },
  {
    id: 'activity-9',
    initials: 'SB',
    tone: '#f1e8ff',
    person: 'Steff Banak',
    action: 'structured',
    target: 'Functional analysis workspace',
    time: 'Monday at 11:24',
    personId: 'steff-banak',
  },
  {
    id: 'activity-10',
    initials: 'BP',
    tone: '#e4f2e8',
    person: 'Blaze Paskal',
    action: 'prototyped',
    target: 'Mechanical calculation engine',
    time: 'Monday at 09:15',
    personId: 'blaze-paskal',
  },
  {
    id: 'activity-11',
    initials: 'AL',
    tone: '#f5e6f0',
    person: 'Aida Loveleys',
    action: 'programmed',
    target: 'Machine-readable operating plan',
    time: 'Friday at 15:40',
    personId: 'aida-loveleys',
  },
])

export const members = Object.freeze([
  {
    id: 'aida-loveleys',
    initials: 'AL',
    tone: '#f5e6f0',
    name: 'Aida Loveleys',
    role: 'Principal Algorithm Architect',
    email: 'aida@luminate.example',
    country: 'United Kingdom',
    team: 'Platform',
    bio: 'Aida writes implementation plans for machines IT insists have not been ordered yet. Her technical specs mix logic with imagination, and somehow the engineering roadmap is always several generations behind her.',
  },
  {
    id: 'norm-barlug',
    initials: 'NB',
    tone: '#e8e4ff',
    name: 'Norm Barlug',
    role: 'Chief Food Security Officer',
    email: 'norm@luminate.example',
    country: 'United States',
    team: 'Agriculture',
    bio: 'Norm is rarely at headquarters because he is usually walking a pilot field with the agriculture team. He measures quarterly performance in grain yield, treats hunger as the only unacceptable backlog, and credits every successful release to the people working beside him.',
  },
  {
    id: 'freddy-fraggin',
    initials: 'FF',
    tone: '#ffe8de',
    name: 'Freddy Fraggin',
    role: 'Chief Silicon Architect',
    email: 'freddy@luminate.example',
    country: 'Italy',
    team: 'Compute',
    bio: 'Freddy keeps asking Hardware whether the entire quarterly roadmap can fit on one chip. By Friday he has redesigned the silicon process, taped out the processor, and started a new company because the existing org chart was slowing him down.',
  },
  {
    id: 'erato-stenes',
    initials: 'ES',
    tone: '#dff5f1',
    name: 'Erato Stenes',
    role: 'Director of Geospatial Science',
    email: 'erato@luminate.example',
    country: 'Greece',
    team: 'Earth Systems',
    bio: 'Erato spends lunch measuring the office flagpole’s shadow, then returns with a surprisingly accurate estimate of the planet’s size. He runs Geospatial with geometry, travel receipts, and absolutely no satellite budget.',
  },
  {
    id: 'tutu-yoyo',
    initials: 'TY',
    tone: '#deedff',
    name: 'Tutu Yoyo',
    role: 'Head of Translational Medicine',
    email: 'tutu@luminate.example',
    country: 'China',
    team: 'Global Health',
    bio: 'Tutu reads the oldest research archive in the company before approving a new experiment. She quietly turns one overlooked plant note into the strongest program in the clinical pipeline, then redirects the launch budget toward the regions that need it most.',
  },
  {
    id: 'emmy-nother',
    initials: 'EN',
    tone: '#f1e8ff',
    name: 'Emmy Nother',
    role: 'Chief Mathematical Systems Officer',
    email: 'emmy@luminate.example',
    country: 'Germany',
    team: 'Theoretical Systems',
    bio: 'Emmy joins architecture reviews whenever the equations refuse to balance. She replaces a month of patches with one symmetry principle, leaves three new algebra frameworks on the whiteboard, and still has to remind Payroll that the work was hers.',
  },
  {
    id: 'steff-banak',
    initials: 'SB',
    tone: '#e4f2e8',
    name: 'Steff Banak',
    role: 'VP of Mathematical Foundations',
    email: 'steff@luminate.example',
    country: 'Poland',
    team: 'Analysis',
    bio: 'Steff has converted half the office whiteboards into Banak spaces and insists every vague requirement needs a proper norm. Optimization teams keep borrowing his frameworks, although nobody is entirely sure when he finds time to write them.',
  },
  {
    id: 'blaze-paskal',
    initials: 'BP',
    tone: '#fff0d9',
    name: 'Blaze Paskal',
    role: 'Director of Computational Tools',
    email: 'blaze@luminate.example',
    country: 'France',
    team: 'Applied Mathematics',
    bio: 'Blaze built Finance a mechanical spreadsheet because repeated arithmetic looked inefficient. Between probability forecasts and fluid-system reviews, he keeps launching small internal tools that accidentally become entire fields of study.',
  },
  {
    id: 'jaggi-boss',
    initials: 'JB',
    tone: '#e8f1ff',
    name: 'Jaggi Boss',
    role: 'Head of Experimental Physics',
    email: 'jaggi@luminate.example',
    country: 'India',
    team: 'Radio Science',
    bio: 'Jaggi refuses to wait six weeks for Procurement, so he builds his own instruments and makes them more sensitive than the catalog models. His calendar alternates between wireless demos and plant-response experiments because he sees no reason for departments to limit the evidence.',
  },
  {
    id: 'fazlo-kan',
    initials: 'FK',
    tone: '#f6e7db',
    name: 'Fazlo Kan',
    role: 'Chief Structural Systems Engineer',
    email: 'fazlo@luminate.example',
    country: 'Bangladesh',
    team: 'Built Environment',
    bio: 'Fazlo enters every Facilities review, redraws the building as a structural tube, and removes a worrying amount of unnecessary material from the estimate. The result is taller, safer, cheaper, and usually sketched before everyone else has opened the slide deck.',
  },
  {
    id: 'alfredo-church',
    initials: 'AC',
    tone: '#eee8fa',
    name: 'Alfredo Church',
    role: 'Director of Functional Systems',
    email: 'alfredo@luminate.example',
    country: 'United States',
    team: 'Logic & Computation',
    bio: 'Alfredo turns every software meeting into functions calling other functions and refuses to approve hidden state. His tiny lambda diagrams somehow explain the whole compute platform, and the functional-programming team treats his 1930s-style notes as current documentation.',
  },
])

export const metrics = Object.freeze([
  {
    id: 'active-projects',
    label: 'Active projects',
    value: '8',
    change: '+2 this month',
    direction: /** @type {const} */ ('positive'),
  },
  {
    id: 'tasks-completed',
    label: 'Tasks completed',
    value: '184',
    change: '+12.4% from June',
    direction: /** @type {const} */ ('positive'),
  },
  {
    id: 'team-focus',
    label: 'Team focus',
    value: '86%',
    change: 'On track',
    direction: /** @type {const} */ ('positive'),
  },
  {
    id: 'review-queue',
    label: 'Review queue',
    value: '5',
    change: '2 due today',
    direction: /** @type {const} */ ('neutral'),
  },
])

/**
 * @param {string} hash
 * @returns {Route}
 */
export function routeFromHash(hash) {
  const route = hash.replace(/^#\//, '').split(/[/?]/)[0]

  return route === 'overview'
    || route === 'projects'
    || route === 'activity'
    || route === 'teams'
    ? route
    : 'overview'
}

/** @param {string} hash */
export function memberFromHash(hash) {
  const match = /^#\/teams\/([a-z0-9-]+)(?:[/?]|$)/.exec(hash)
  return match?.[1] ?? null
}

export function normalizeHash() {
  if (!/^#\/(overview|projects|activity|teams)(?:[/?]|$)/.test(window.location.hash)) {
    window.history.replaceState(null, '', '#/overview')
  }
}

/**
 * @param {Route} route
 * @param {string | null} memberId
 */
export function documentTitle(route, memberId) {
  const member = members.find(item => item.id === memberId)
  return (member?.name ?? routeLabels[route]) + ' · Luminate'
}
