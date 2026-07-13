// cspell:words libm

import {check} from '@augment-vir/assert';
import {filterMap} from '@augment-vir/common';
import {CpuArchitecture, HyphenationDictionary, LibmSignature} from './os-fingerprints.js';

/** One captured fingerprint from a specific browser build. */
export type FingerprintObservation = Readonly<{
    /** Browser major version this was captured on (e.g. '149'); used only to match, never shown. */
    majorVersion: string;
    hyphenationDictionary: HyphenationDictionary | undefined;
    libmSignature: LibmSignature | undefined;
    audioSum: number | undefined;
    cpuArchitecture: CpuArchitecture | undefined;
}>;

/**
 * A reference of the fingerprints each OS + browser is known to produce, stored as one observation
 * per captured browser build. Keeping the version lets an exactly-known version be compared
 * exactly; a value seen for the browser but not for that exact version stays a soft (not failing)
 * result. Fill placeholder combos in from the `OS_FINGERPRINT_DATA` lines the tests print in the
 * GitHub Actions logs by adding an observation.
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
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.Glibc,
                audioSum: 956.316634,
                cpuArchitecture: CpuArchitecture.Arm,
            },
            {
                majorVersion: '149',
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.AppleLibm,
                audioSum: 956.3166342371878,
                cpuArchitecture: CpuArchitecture.Arm,
            },
        ],
    },
    {
        os: 'macOS',
        browser: 'Safari',
        observations: [
            {
                majorVersion: '26',
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.AppleLibm,
                audioSum: 956.762599,
                cpuArchitecture: CpuArchitecture.Arm,
            },
            {
                majorVersion: '26',
                hyphenationDictionary: HyphenationDictionary.Apple,
                libmSignature: LibmSignature.AppleLibm,
                audioSum: 956.3167136899606,
                cpuArchitecture: CpuArchitecture.Arm,
            },
        ],
    },
    {
        os: 'macOS',
        browser: 'Firefox',
        observations: [
            {
                majorVersion: '148',
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.597307,
                cpuArchitecture: CpuArchitecture.Arm,
            },
            {
                majorVersion: '151',
                hyphenationDictionary: HyphenationDictionary.Bundled,
                libmSignature: LibmSignature.Glibc,
                audioSum: 766.5973066808656,
                cpuArchitecture: CpuArchitecture.Arm,
            },
        ],
    },
    {
        os: 'Windows',
        browser: 'Chrome',
        observations: [],
    },
    {
        os: 'Windows',
        browser: 'Safari',
        observations: [],
    },
    {
        os: 'Windows',
        browser: 'Firefox',
        observations: [],
    },
    {
        os: 'Linux',
        browser: 'Chrome',
        observations: [],
    },
    {
        os: 'Linux',
        browser: 'Safari',
        observations: [],
    },
    {
        os: 'Linux',
        browser: 'Firefox',
        observations: [],
    },
];

function unique<Value>(values: ReadonlyArray<Value>): ReadonlyArray<Value> {
    return values.filter((value, index) => values.indexOf(value) === index);
}

/** The distinct value each field takes across a set of observations, for display and matching. */
export type FingerprintFieldValues = Readonly<{
    hyphenationDictionaries: ReadonlyArray<HyphenationDictionary>;
    libmSignatures: ReadonlyArray<LibmSignature>;
    audioSums: ReadonlyArray<number>;
    cpuArchitectures: ReadonlyArray<CpuArchitecture>;
}>;

export function summarizeObservations(
    observations: ReadonlyArray<FingerprintObservation>,
): FingerprintFieldValues {
    return {
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
        cpuArchitectures: unique(
            filterMap(observations, (observation) => observation.cpuArchitecture, check.isDefined),
        ),
    };
}
