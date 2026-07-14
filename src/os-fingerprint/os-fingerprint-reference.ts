// cspell:words libm ucrt

import {check} from '@augment-vir/assert';
import {filterMap} from '@augment-vir/common';
import {CpuArchitecture, HyphenationDictionary, LibmSignature} from './os-fingerprints.js';

/** One captured fingerprint from a specific browser build. */
export type FingerprintObservation = Readonly<{
    /** Browser major version this was captured on (e.g. '149'); documentation only. */
    majorVersion: string;
    /** The CPU architecture this was captured on. Only the audio sum depends on it. */
    cpuArch: CpuArchitecture | undefined;
    hyphenationDictionary: HyphenationDictionary | undefined;
    libmSignature: LibmSignature | undefined;
    audioSum: number | undefined;
}>;

/**
 * A reference of the fingerprints each OS + browser is known to produce, stored as one observation
 * per captured browser build. A live value is compared against every value the OS + browser is
 * known to produce across all captured versions, so the exact version need not be present. Fill
 * placeholder combos in from the `OS_FINGERPRINT_DATA` lines the tests print in the GitHub Actions
 * logs by adding an observation.
 */
export type FingerprintReferenceEntry = Readonly<{
    /** Bowser `os.name`. */
    os: string;
    /** Bowser `browser.name`. */
    browser: string;
    observations: ReadonlyArray<FingerprintObservation>;
}>;

export const osFingerprintReference: ReadonlyArray<FingerprintReferenceEntry> = [
    {
        os: 'macOS',
        browser: 'Chrome',
        observations: [
            {
                majorVersion: '140',
                cpuArch: CpuArchitecture.Arm,
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.Glibc,
                audioSum: 956.316634,
            },
            {
                majorVersion: '149',
                cpuArch: CpuArchitecture.Arm,
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.AppleLibm,
                audioSum: 956.3166342371878,
            },
        ],
    },
    {
        os: 'macOS',
        browser: 'Safari',
        observations: [
            {
                /**
                 * Safari re-seeds its audio noise every session, so its audio sum is randomized and
                 * left unset; hyphenation and libm remain stable, usable signals.
                 */
                majorVersion: '26',
                cpuArch: CpuArchitecture.Arm,
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.AppleLibm,
                audioSum: undefined,
            },
        ],
    },
    {
        os: 'macOS',
        browser: 'Firefox',
        observations: [
            {
                majorVersion: '148',
                cpuArch: CpuArchitecture.Arm,
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.597307,
            },
            {
                majorVersion: '151',
                cpuArch: CpuArchitecture.Arm,
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.5973066808656,
            },
        ],
    },
    {
        os: 'Windows',
        browser: 'Chrome',
        observations: [
            {
                majorVersion: '149',
                cpuArch: CpuArchitecture.X86,
                hyphenationDictionary: HyphenationDictionary.Minikin,
                libmSignature: LibmSignature.Ucrt,
                audioSum: 956.3164,
            },
        ],
    },
    {
        os: 'Windows',
        browser: 'Firefox',
        observations: [
            {
                majorVersion: '151',
                cpuArch: CpuArchitecture.X86,
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.5973,
            },
        ],
    },
    {
        os: 'Linux',
        browser: 'Chrome',
        observations: [
            {
                majorVersion: '149',
                cpuArch: CpuArchitecture.X86,
                hyphenationDictionary: HyphenationDictionary.Minikin,
                libmSignature: LibmSignature.Glibc,
                audioSum: 956.3164,
            },
        ],
    },
    {
        os: 'Linux',
        browser: 'Firefox',
        observations: [
            {
                majorVersion: '151',
                cpuArch: CpuArchitecture.X86,
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.5973,
            },
            {
                majorVersion: '152',
                cpuArch: CpuArchitecture.X86,
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.5973,
            },
        ],
    },
];

function unique<Value>(values: ReadonlyArray<Value>): ReadonlyArray<Value> {
    return values.filter((value, index) => values.indexOf(value) === index);
}

/** The distinct value each field takes across a set of observations, for display and matching. */
export type FingerprintFieldValues = Readonly<{
    cpuArchitectures: ReadonlyArray<CpuArchitecture>;
    hyphenationDictionaries: ReadonlyArray<HyphenationDictionary>;
    libmSignatures: ReadonlyArray<LibmSignature>;
    audioSums: ReadonlyArray<number>;
}>;

export function summarizeObservations(
    observations: ReadonlyArray<FingerprintObservation>,
): FingerprintFieldValues {
    return {
        cpuArchitectures: unique(
            filterMap(observations, (observation) => observation.cpuArch, check.isDefined),
        ),
        hyphenationDictionaries: unique(
            filterMap(
                observations,
                (observation) => observation.hyphenationDictionary,
                check.isDefined,
            ),
        ),
        libmSignatures: unique(
            filterMap(observations, (observation) => observation.libmSignature, check.isDefined),
        ),
        audioSums: unique(
            filterMap(observations, (observation) => observation.audioSum, check.isDefined),
        ),
    };
}

/**
 * The audio sums the observations produced on a given CPU architecture. Audio varies with
 * architecture, so a live audio sum must only be compared against sums captured on the same one.
 * When the architecture is unknown (Safari and Firefox expose none), every captured sum is returned
 * so nothing is falsely flagged.
 */
export function audioSumsForArch({
    observations,
    cpuArch,
}: Readonly<{
    observations: ReadonlyArray<FingerprintObservation>;
    cpuArch: CpuArchitecture | undefined;
}>): ReadonlyArray<number> {
    const scopedObservations =
        cpuArch == undefined
            ? observations
            : observations.filter((observation) => observation.cpuArch === cpuArch);
    return unique(
        filterMap(scopedObservations, (observation) => observation.audioSum, check.isDefined),
    );
}
