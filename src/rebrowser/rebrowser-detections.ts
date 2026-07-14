// cspell:words pptr

import {check} from '@augment-vir/assert';
import {createArray, filterMap, wait} from '@augment-vir/common';
import Bowser from 'bowser';

declare global {
    interface Window {
        /**
         * Exposed for the main-world execution test; automation calls it to prove main-world
         * access.
         */
        dummyFn?: (() => boolean) | undefined;
        /**
         * Populated by `page.exposeFunction('exposedFn', ...)`; inspected for automation binding
         * leaks.
         */
        exposedFn?: ((...args: ReadonlyArray<unknown>) => unknown) | undefined;
        /** Injected by unpatched Playwright into every page's global scope. */
        __pwInitScripts?: unknown;
        /** The latest detection results, mirrored here so automation can read them without the DOM. */
        rebrowserDetections?: ReadonlyArray<RebrowserDetection> | undefined;
    }
}

/** Every automation-detection test ported from https://bot-detector.rebrowser.net/. */
export enum RebrowserDetectionType {
    DummyFn = 'dummyFn',
    SourceUrlLeak = 'sourceUrlLeak',
    MainWorldExecution = 'mainWorldExecution',
    RuntimeEnableLeak = 'runtimeEnableLeak',
    ExposeFunctionLeak = 'exposeFunctionLeak',
    NavigatorWebdriver = 'navigatorWebdriver',
    BypassCsp = 'bypassCsp',
    Viewport = 'viewport',
    UserAgentData = 'userAgentData',
    UserAgent = 'userAgent',
    PwInitScripts = 'pwInitScripts',
}

export enum DetectionRating {
    /** No leak or safe behavior. */
    Pass = 'pass',
    /** Waiting on an external trigger (for example an automation-driven evaluate). */
    NotTriggered = 'notTriggered',
    /** Suspicious but not conclusive. */
    Warning = 'warning',
    /** Automation was detected. */
    Detected = 'detected',
}

export const detectionRatingIcons: Record<DetectionRating, string> = {
    [DetectionRating.Pass]: '🟢',
    [DetectionRating.NotTriggered]: '⚪️',
    [DetectionRating.Warning]: '🟡',
    [DetectionRating.Detected]: '🔴',
};

export type RebrowserDetection = Readonly<{
    type: RebrowserDetectionType;
    rating: DetectionRating;
    note: string;
    debug: string | undefined;
    /** Milliseconds between page load and when this result was last updated. */
    msSinceLoad: number;
}>;

export type DetectionInput = Readonly<{
    type: RebrowserDetectionType;
    rating: DetectionRating;
    note: string;
    debug?: string | undefined;
}>;

export type ReportDetection = (input: DetectionInput) => void;

export type RebrowserDetectionsListener = (detections: ReadonlyArray<RebrowserDetection>) => void;

type RunState = Readonly<{isStopped: boolean}>;

function initDummyFn(report: ReportDetection): void {
    report({
        type: RebrowserDetectionType.DummyFn,
        rating: DetectionRating.NotTriggered,
        note: 'Call window.dummyFn() from the main context to test main-world object access.',
    });

    window.dummyFn = function dummyFn() {
        report({
            type: RebrowserDetectionType.DummyFn,
            rating: DetectionRating.Detected,
            note: 'window.dummyFn() was called, so scripts can reach main-world objects.',
        });
        return true;
    };
}

function initSourceUrlLeak(report: ReportDetection): void {
    const suspiciousMarkers: ReadonlyArray<Readonly<{marker: string; note: string}>> = [
        {
            marker: 'pptr:',
            note: 'The error stack contains "pptr:", which indicates unpatched Puppeteer.',
        },
        {
            marker: 'UtilityScript.',
            note: 'The error stack contains "UtilityScript.", which indicates unpatched Playwright.',
        },
    ];

    function reportSourceUrlLeak(): void {
        const stack = new Error('Detection Error').stack ?? '';
        const detectedMarker = suspiciousMarkers.find((entry) => stack.includes(entry.marker));

        if (detectedMarker) {
            report({
                type: RebrowserDetectionType.SourceUrlLeak,
                rating: DetectionRating.Detected,
                note: detectedMarker.note,
                debug: stack,
            });
        } else {
            report({
                type: RebrowserDetectionType.SourceUrlLeak,
                rating: DetectionRating.Pass,
                note: 'The error stack contains nothing suspicious.',
                debug: stack,
            });
        }
    }

    /** The wrapper fires on any getElementById call, so automation triggers it from its own world. */
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = function patchedGetElementById(elementId: string) {
        reportSourceUrlLeak();
        return originalGetElementById(elementId);
    };

    report({
        type: RebrowserDetectionType.SourceUrlLeak,
        rating: DetectionRating.NotTriggered,
        note: 'Call document.getElementById with "detections-json" to test for a sourceUrl leak.',
    });
}

function initMainWorldExecution(report: ReportDetection): void {
    report({
        type: RebrowserDetectionType.MainWorldExecution,
        rating: DetectionRating.NotTriggered,
        note: 'Call document.getElementsByClassName("div") to trigger this test. If it never fires, your script runs in a safe isolated world.',
    });

    const originalGetElementsByClassName = document.getElementsByClassName.bind(document);
    document.getElementsByClassName = function patchedGetElementsByClassName(classNames: string) {
        report({
            type: RebrowserDetectionType.MainWorldExecution,
            rating: DetectionRating.Detected,
            note: 'document.getElementsByClassName() ran in the main world. Use rebrowser-patches to run scripts in an isolated world.',
            debug: `classNames = ${classNames}`,
        });
        return originalGetElementsByClassName(classNames);
    };
}

/**
 * Guards the Runtime.enable probe so it logs to the console at most once per page load, no matter
 * how many times the detection is (re)started.
 */
const runtimeEnableProbeState = {
    hasProbed: false,
};

async function reportRuntimeEnableLeak(report: ReportDetection): Promise<void> {
    report({
        type: RebrowserDetectionType.RuntimeEnableLeak,
        rating: DetectionRating.Pass,
        note: 'No Runtime.enable (CDP) leak detected.',
    });

    if (runtimeEnableProbeState.hasProbed) {
        return;
    }
    runtimeEnableProbeState.hasProbed = true;

    const stackLookup = {
        count: 0,
    };
    const probeError = new Error();
    Object.defineProperty(probeError, 'stack', {
        configurable: false,
        enumerable: false,
        get() {
            stackLookup.count += 1;
            return '';
        },
    });
    /**
     * Logging the error to the console once is the actual probe: an active CDP Runtime.enable (or
     * open devtools) reads the `stack` getter to format the log, which increments the counter. A
     * single log avoids console noise on a normal browser where the stack is never read.
     */
    // eslint-disable-next-line no-console
    console.debug(probeError);

    await wait({
        milliseconds: 500,
    });

    if (stackLookup.count > 0) {
        report({
            type: RebrowserDetectionType.RuntimeEnableLeak,
            rating: DetectionRating.Detected,
            note: 'A Runtime.enable (CDP) leak was detected. Devtools may be open, or CDP Runtime.enable is active.',
            debug: `stackLookupCount = ${stackLookup.count}`,
        });
    }
}

function detectExposeFunctionLeak(): DetectionInput {
    const exposedFn = window.exposedFn;
    if (check.isUndefined(exposedFn)) {
        return {
            type: RebrowserDetectionType.ExposeFunctionLeak,
            rating: DetectionRating.NotTriggered,
            note: 'No window.exposedFn is present. Call page.exposeFunction to trigger this test.',
        };
    }

    const exposedFnSource = exposedFn.toString();
    if (exposedFnSource.includes('This is the Puppeteer binding')) {
        return {
            type: RebrowserDetectionType.ExposeFunctionLeak,
            rating: DetectionRating.Detected,
            note: 'window.exposedFn is the unpatched Puppeteer page.exposeFunction binding.',
            debug: exposedFnSource,
        };
    } else if (exposedFnSource.includes('exposeBindingHandle supports a single argument')) {
        return {
            type: RebrowserDetectionType.ExposeFunctionLeak,
            rating: DetectionRating.Detected,
            note: 'window.exposedFn is the unpatched Playwright page.exposeFunction binding.',
            debug: exposedFnSource,
        };
    }

    const suspiciousWindowKey = Object.keys(window).find((key) => {
        if (key.startsWith('puppeteer_') || key === '__playwright__binding__') {
            return true;
        }

        const value = Reflect.get(window, key);
        return check.isFunction(value) && Reflect.get(value, '__installed') === true;
    });
    if (suspiciousWindowKey != undefined) {
        return {
            type: RebrowserDetectionType.ExposeFunctionLeak,
            rating: DetectionRating.Detected,
            note: `window.${suspiciousWindowKey} indicates an unpatched page.exposeFunction leak.`,
            debug: `windowKey = ${suspiciousWindowKey}`,
        };
    }

    return {
        type: RebrowserDetectionType.ExposeFunctionLeak,
        rating: DetectionRating.Pass,
        note: 'No exposeFunction leak was detected.',
    };
}

async function pollExposeFunctionLeak(report: ReportDetection, runState: RunState): Promise<void> {
    while (!runState.isStopped) {
        report(detectExposeFunctionLeak());
        await wait({
            milliseconds: 100,
        });
    }
}

function getNavigatorWebdriverNote(): Readonly<{note: string; debug: string}> | undefined {
    /** Typed as `unknown` because navigator.webdriver can be deleted at runtime to evade detection. */
    const webdriverValue: unknown = Reflect.get(navigator, 'webdriver');

    if (webdriverValue === true) {
        return {
            note: 'navigator.webdriver is true, which flags automation. Launch Chrome with --disable-blink-features=AutomationControlled.',
            debug: 'navigator.webdriver = true',
        };
    } else if (check.isUndefined(webdriverValue)) {
        return {
            note: 'navigator.webdriver is undefined, which is abnormal and may indicate it was deleted manually.',
            debug: 'navigator.webdriver = undefined',
        };
    } else if (Object.getOwnPropertyNames(navigator).length > 0) {
        return {
            note: 'Object.getOwnPropertyNames(navigator) should be empty for a normal browser.',
            debug: `Object.getOwnPropertyNames(navigator) = ${JSON.stringify(Object.getOwnPropertyNames(navigator))}`,
        };
    } else if (check.isDefined(Object.getOwnPropertyDescriptor(navigator, 'webdriver'))) {
        return {
            note: 'The own property descriptor for navigator.webdriver should be undefined.',
            debug: 'own webdriver descriptor is present',
        };
    }

    return undefined;
}

function reportNavigatorWebdriver(report: ReportDetection): void {
    const suspiciousNote = getNavigatorWebdriverNote();

    if (suspiciousNote) {
        report({
            type: RebrowserDetectionType.NavigatorWebdriver,
            rating: DetectionRating.Detected,
            note: suspiciousNote.note,
            debug: suspiciousNote.debug,
        });
    } else {
        report({
            type: RebrowserDetectionType.NavigatorWebdriver,
            rating: DetectionRating.Pass,
            note: 'No navigator.webdriver flag is present.',
        });
    }
}

function initBypassCsp(report: ReportDetection): void {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    /** A cross-origin script only loads if the page Content Security Policy was bypassed. */
    script.src = 'https://www.w3schools.com/js/myScript.js';
    script.addEventListener('error', () => {
        report({
            type: RebrowserDetectionType.BypassCsp,
            rating: DetectionRating.Pass,
            note: 'Content Security Policy is enforced, which is expected for a normal browser.',
        });
    });
    script.addEventListener('load', () => {
        report({
            type: RebrowserDetectionType.BypassCsp,
            rating: DetectionRating.Detected,
            note: 'Content Security Policy was bypassed. You may be using Page.setBypassCSP (Puppeteer) or bypassCSP: true (Playwright).',
        });
    });
    document.head.append(script);
}

function getDefaultViewportNote({
    width,
    height,
}: Readonly<{width: number; height: number}>): string | undefined {
    if (width === 800 && height === 600) {
        return 'Viewport matches the Puppeteer default of 800x600. Set defaultViewport: null.';
    } else if (width === 1280 && height === 720) {
        return 'Viewport matches the Playwright default of 1280x720. Set viewport: null.';
    }

    return undefined;
}

function reportViewport(report: ReportDetection): void {
    const width = Math.max(document.documentElement.clientWidth, window.innerWidth);
    const height = Math.max(document.documentElement.clientHeight, window.innerHeight);
    const debug = `width = ${width}, height = ${height}`;

    const defaultViewportNote = getDefaultViewportNote({
        width,
        height,
    });

    if (defaultViewportNote) {
        report({
            type: RebrowserDetectionType.Viewport,
            rating: DetectionRating.Detected,
            note: defaultViewportNote,
            debug,
        });
    } else {
        report({
            type: RebrowserDetectionType.Viewport,
            rating: DetectionRating.Pass,
            note: 'Viewport does not match automation-library defaults.',
            debug,
        });
    }
}

type UserAgentBrandVersion = Readonly<{brand: string; version: string}>;

type HighEntropyResult = Readonly<{
    fullVersionList?: ReadonlyArray<UserAgentBrandVersion> | undefined;
}>;

type UserAgentData = Readonly<{
    getHighEntropyValues: (hints: ReadonlyArray<string>) => Promise<HighEntropyResult>;
}>;

function getUserAgentData(): UserAgentData | undefined {
    const candidate = Reflect.get(navigator, 'userAgentData');
    if (candidate && check.isFunction(Reflect.get(candidate, 'getHighEntropyValues'))) {
        /** Navigator.userAgentData is not in the DOM lib types, so this untyped read is unavoidable. */
        return candidate as UserAgentData;
    }
    return undefined;
}

function fetchLatestStableChromeVersion(): Promise<string | undefined> {
    return fetch(
        'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1&offset=0',
    )
        .then((response) =>
            response.ok
                ? response.json()
                : Promise.reject(new Error(`${response.status} ${response.statusText}`)),
        )
        .then((releases: ReadonlyArray<{version: string}>) => releases[0]?.version)
        .catch(() => undefined);
}

function compareChromeVersions({
    installed,
    latestStable,
}: Readonly<{installed: string; latestStable: string}>): number {
    const installedParts = installed.split('.').map(Number);
    const stableParts = latestStable.split('.').map(Number);
    const partCount = Math.max(installedParts.length, stableParts.length);
    const differences = createArray(
        partCount,
        (index) => (installedParts[index] ?? 0) - (stableParts[index] ?? 0),
    );
    return differences.find((difference) => difference !== 0) ?? 0;
}

async function reportUserAgentData(report: ReportDetection): Promise<void> {
    const userAgentData = getUserAgentData();
    if (!userAgentData) {
        report({
            type: RebrowserDetectionType.UserAgentData,
            rating: DetectionRating.NotTriggered,
            note: 'navigator.userAgentData is unavailable, so the Chrome version cannot be checked. These tests target Chromium-based browsers.',
        });
        return;
    }

    const relevantBrands = await userAgentData
        .getHighEntropyValues(['fullVersionList'])
        .then((values) => values.fullVersionList ?? [])
        .then((brands) =>
            brands.filter((item) =>
                [
                    'Chromium',
                    'Google Chrome',
                ].includes(item.brand),
            ),
        )
        .catch(() => []);
    const brandNames = relevantBrands.map((item) => item.brand);
    const debug = `fullVersionList = ${JSON.stringify(relevantBrands)}`;

    if (relevantBrands.length === 0) {
        report({
            type: RebrowserDetectionType.UserAgentData,
            rating: DetectionRating.Warning,
            note: 'Cannot detect a Chromium or Chrome brand. These tests target Chromium-based browsers.',
            debug,
        });
        return;
    } else if (brandNames.includes('Chromium') && !brandNames.includes('Google Chrome')) {
        report({
            type: RebrowserDetectionType.UserAgentData,
            rating: DetectionRating.Detected,
            note: 'Only the Chromium brand is present, which usually means Google Chrome for Testing. Point executablePath at stable Google Chrome.',
            debug,
        });
        return;
    }

    const installedVersion = relevantBrands.find((item) => item.brand === 'Google Chrome')?.version;
    const latestStableVersion = await fetchLatestStableChromeVersion();
    if (installedVersion == undefined || latestStableVersion == undefined) {
        report({
            type: RebrowserDetectionType.UserAgentData,
            rating: DetectionRating.NotTriggered,
            note: 'Cannot fetch the latest stable Chrome release to compare versions.',
            debug,
        });
        return;
    } else if (
        compareChromeVersions({
            installed: installedVersion,
            latestStable: latestStableVersion,
        }) > 0
    ) {
        report({
            type: RebrowserDetectionType.UserAgentData,
            rating: DetectionRating.Warning,
            note: `Chrome version ${installedVersion} is newer than the latest stable release ${latestStableVersion}, which is abnormal.`,
            debug,
        });
        return;
    }

    report({
        type: RebrowserDetectionType.UserAgentData,
        rating: DetectionRating.Pass,
        note: `Chrome version ${installedVersion} is not newer than the latest stable release ${latestStableVersion}.`,
        debug,
    });
}

/** Parses the browser name and version out of a raw userAgent string via the bowser package. */
function parseUserAgentBrowser(
    userAgent: string,
): Readonly<{name: string; version: string}> | undefined {
    const browser = Bowser.parse(userAgent).browser;
    if (browser.name == undefined || browser.version == undefined) {
        return undefined;
    }
    return {
        name: browser.name,
        version: browser.version,
    };
}

/**
 * The userAgentData-based sibling of {@link reportUserAgentData}: it derives the same Chrome version
 * comparison from the legacy navigator.userAgent string instead. It cannot detect Chrome for
 * Testing because that shares an identical userAgent with normal Chrome.
 */
async function reportUserAgent(report: ReportDetection): Promise<void> {
    const browser = parseUserAgentBrowser(navigator.userAgent);
    const debug = `userAgent = ${navigator.userAgent}`;

    if (browser == undefined) {
        report({
            type: RebrowserDetectionType.UserAgent,
            rating: DetectionRating.NotTriggered,
            note: 'Could not parse a browser and version out of navigator.userAgent.',
            debug,
        });
        return;
    } else if (
        ![
            'Chrome',
            'Chromium',
        ].includes(browser.name)
    ) {
        report({
            type: RebrowserDetectionType.UserAgent,
            rating: DetectionRating.NotTriggered,
            note: `navigator.userAgent reports ${browser.name}, but these tests target Chromium-based browsers.`,
            debug,
        });
        return;
    }

    const latestStableVersion = await fetchLatestStableChromeVersion();
    if (latestStableVersion == undefined) {
        report({
            type: RebrowserDetectionType.UserAgent,
            rating: DetectionRating.NotTriggered,
            note: 'Cannot fetch the latest stable Chrome release to compare versions.',
            debug,
        });
        return;
    } else if (
        compareChromeVersions({
            installed: browser.version,
            latestStable: latestStableVersion,
        }) > 0
    ) {
        report({
            type: RebrowserDetectionType.UserAgent,
            rating: DetectionRating.Warning,
            note: `navigator.userAgent Chrome version ${browser.version} is newer than the latest stable release ${latestStableVersion}, which is abnormal.`,
            debug,
        });
        return;
    }

    report({
        type: RebrowserDetectionType.UserAgent,
        rating: DetectionRating.Pass,
        note: `navigator.userAgent Chrome version ${browser.version} is not newer than the latest stable release ${latestStableVersion}.`,
        debug,
    });
}

async function pollPwInitScripts(report: ReportDetection, runState: RunState): Promise<void> {
    report({
        type: RebrowserDetectionType.PwInitScripts,
        rating: DetectionRating.Pass,
        note: 'No window.__pwInitScripts object detected.',
    });

    while (!runState.isStopped) {
        if (window.__pwInitScripts !== undefined) {
            report({
                type: RebrowserDetectionType.PwInitScripts,
                rating: DetectionRating.Detected,
                note: 'window.__pwInitScripts exists, which unpatched Playwright injects into every page.',
                debug: `__pwInitScripts = ${JSON.stringify(window.__pwInitScripts)}`,
            });
            return;
        }

        await wait({
            milliseconds: 100,
        });
    }
}

/**
 * Page-global controller. The detections hook `document`/`window` globals, so they must only ever
 * be set up once; this holds the single running instance and its most recent results.
 */
const detectionsController = {
    isStarted: false,
    latest: [] as ReadonlyArray<RebrowserDetection>,
    listener: undefined as RebrowserDetectionsListener | undefined,
};

/**
 * Starts every rebrowser automation-detection test and reports results through `onUpdate` whenever
 * one changes. Safe to call more than once: the tests and their global hooks are only ever set up
 * on the first call, and later calls simply swap in the new listener and replay the latest
 * results.
 */
export function startRebrowserDetections(onUpdate: RebrowserDetectionsListener): void {
    detectionsController.listener = onUpdate;
    onUpdate(detectionsController.latest);

    if (detectionsController.isStarted) {
        return;
    }
    detectionsController.isStarted = true;

    const startTime = performance.now();
    const detectionsByType = new Map<RebrowserDetectionType, RebrowserDetection>();
    const runState = {
        isStopped: false,
    };

    function report({type, rating, note, debug}: DetectionInput): void {
        const existing = detectionsByType.get(type);
        if (
            existing &&
            existing.rating === rating &&
            existing.note === note &&
            existing.debug === debug
        ) {
            return;
        }

        detectionsByType.set(type, {
            type,
            rating,
            note,
            debug,
            msSinceLoad: Number((performance.now() - startTime).toFixed(3)),
        });

        const ordered = filterMap(
            Object.values(RebrowserDetectionType),
            (detectionType) => detectionsByType.get(detectionType),
            check.isDefined,
        );
        detectionsController.latest = ordered;
        window.rebrowserDetections = ordered;
        detectionsController.listener?.(ordered);
    }

    initDummyFn(report);
    initSourceUrlLeak(report);
    initMainWorldExecution(report);
    void reportRuntimeEnableLeak(report);
    void pollExposeFunctionLeak(report, runState);
    reportNavigatorWebdriver(report);
    initBypassCsp(report);
    reportViewport(report);
    void reportUserAgentData(report);
    void reportUserAgent(report);
    void pollPwInitScripts(report, runState);
}
