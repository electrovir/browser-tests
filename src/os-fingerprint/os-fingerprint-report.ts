// cspell:words libm

import {check} from '@augment-vir/assert';
import {filterMap} from '@augment-vir/common';
import {
    osFingerprintReference,
    summarizeObservations,
    type FingerprintReferenceEntry,
} from './os-fingerprint-reference.js';
import {
    computeAudioFingerprint,
    detectCpuArchitecture,
    detectHyphenationDictionary,
    detectMathLibm,
    FingerprintVerdict,
    getBrowserGroundTruth,
    OsFingerprintType,
    type BrowserGroundTruth,
} from './os-fingerprints.js';

export type FingerprintComparison = Readonly<{
    type: OsFingerprintType;
    label: string;
    /** The live measured value, as a display string. */
    detected: string;
    /** Every value the claimed browser + OS is known to produce, as display strings. */
    expected: ReadonlyArray<string>;
    verdict: FingerprintVerdict;
}>;

export type OsFingerprintReport = Readonly<{
    groundTruth: BrowserGroundTruth;
    /** The reference row for the browser + OS the user agent claims, if it has been captured. */
    claimedReference: FingerprintReferenceEntry | undefined;
    comparisons: ReadonlyArray<FingerprintComparison>;
}>;

const fingerprintLabels: Record<OsFingerprintType, string> = {
    [OsFingerprintType.Hyphenation]: 'hyphenation dictionary',
    [OsFingerprintType.MathLibm]: 'math libm signature',
    [OsFingerprintType.Audio]: 'audio fingerprint',
    [OsFingerprintType.CpuArchitecture]: 'cpu architecture',
};

/**
 * Audio sums drift slightly by browser build, so compare within a window that still separates
 * engines.
 */
const audioMatchTolerance = 50;

/**
 * Classifies a live value against the reference for the claimed browser + OS:
 *
 * - Matches an observation of the _exact_ claimed browser version → confirmed match.
 * - Matches an observation of the claimed browser at some _other_ version → consistent, but we have
 *   no reference for this exact version, so it stays unverified rather than a confident match.
 * - Matches only a _different_ browser + OS → the value belongs elsewhere, so the UA is lying.
 * - Matches nothing (or no live value / uncaptured combo) → nothing to confirm against.
 */
export function classifyFingerprint<Value>({
    live,
    exactValues,
    anyValues,
    allKnown,
    isMatch,
}: Readonly<{
    live: Value | undefined;
    exactValues: ReadonlyArray<Value>;
    anyValues: ReadonlyArray<Value>;
    allKnown: ReadonlyArray<Value>;
    isMatch: (candidate: Value) => boolean;
}>): FingerprintVerdict {
    if (live == undefined || anyValues.length === 0) {
        return FingerprintVerdict.NoReference;
    } else if (exactValues.some(isMatch)) {
        return FingerprintVerdict.Match;
    } else if (anyValues.some(isMatch)) {
        return FingerprintVerdict.Unverified;
    } else if (allKnown.some(isMatch)) {
        return FingerprintVerdict.Mismatch;
    }
    return FingerprintVerdict.Unverified;
}

export async function runOsFingerprints(): Promise<OsFingerprintReport> {
    const groundTruth = getBrowserGroundTruth();
    const claimedReference = osFingerprintReference.find(
        (entry) => entry.os === groundTruth.osName && entry.browser === groundTruth.browserName,
    );
    const claimedObservations = claimedReference?.observations ?? [];
    const liveMajorVersion = groundTruth.browserVersion?.split('.')[0];
    const exactObservations = claimedObservations.filter(
        (observation) => observation.majorVersion === liveMajorVersion,
    );
    const allObservations = osFingerprintReference.flatMap((entry) => entry.observations);
    const claimedSummary = summarizeObservations(claimedObservations);

    const hyphenation = detectHyphenationDictionary();
    const mathLibm = detectMathLibm();
    const audio = await computeAudioFingerprint();
    const cpuArchitecture = detectCpuArchitecture();

    const comparisons: ReadonlyArray<FingerprintComparison> = [
        {
            type: OsFingerprintType.Hyphenation,
            label: fingerprintLabels[OsFingerprintType.Hyphenation],
            detected: hyphenation.detected ?? 'none',
            expected: claimedSummary.hyphenationDictionaries,
            verdict: classifyFingerprint({
                live: hyphenation.detected,
                exactValues: filterMap(
                    exactObservations,
                    (observation) => observation.hyphenationDictionary,
                    check.isDefined,
                ),
                anyValues: claimedSummary.hyphenationDictionaries,
                allKnown: filterMap(
                    allObservations,
                    (observation) => observation.hyphenationDictionary,
                    check.isDefined,
                ),
                isMatch: (candidate) => candidate === hyphenation.detected,
            }),
        },
        {
            type: OsFingerprintType.MathLibm,
            label: fingerprintLabels[OsFingerprintType.MathLibm],
            detected: mathLibm.detected ?? 'none',
            expected: claimedSummary.libmSignatures,
            verdict: classifyFingerprint({
                live: mathLibm.detected,
                exactValues: filterMap(
                    exactObservations,
                    (observation) => observation.libmSignature,
                    check.isDefined,
                ),
                anyValues: claimedSummary.libmSignatures,
                allKnown: filterMap(
                    allObservations,
                    (observation) => observation.libmSignature,
                    check.isDefined,
                ),
                isMatch: (candidate) => candidate === mathLibm.detected,
            }),
        },
        {
            type: OsFingerprintType.Audio,
            label: fingerprintLabels[OsFingerprintType.Audio],
            detected: audio.sum.toFixed(4),
            expected: claimedSummary.audioSums.map((sum) => sum.toFixed(4)),
            verdict: classifyFingerprint({
                live: audio.sum,
                exactValues: filterMap(
                    exactObservations,
                    (observation) => observation.audioSum,
                    check.isDefined,
                ),
                anyValues: claimedSummary.audioSums,
                allKnown: filterMap(
                    allObservations,
                    (observation) => observation.audioSum,
                    check.isDefined,
                ),
                isMatch: (candidate) => Math.abs(candidate - audio.sum) <= audioMatchTolerance,
            }),
        },
        {
            type: OsFingerprintType.CpuArchitecture,
            label: fingerprintLabels[OsFingerprintType.CpuArchitecture],
            detected: cpuArchitecture.detected,
            expected: claimedSummary.cpuArchitectures,
            verdict: classifyFingerprint({
                live: cpuArchitecture.detected,
                exactValues: filterMap(
                    exactObservations,
                    (observation) => observation.cpuArchitecture,
                    check.isDefined,
                ),
                anyValues: claimedSummary.cpuArchitectures,
                allKnown: filterMap(
                    allObservations,
                    (observation) => observation.cpuArchitecture,
                    check.isDefined,
                ),
                isMatch: (candidate) => candidate === cpuArchitecture.detected,
            }),
        },
    ];

    return {
        groundTruth,
        claimedReference,
        comparisons,
    };
}
