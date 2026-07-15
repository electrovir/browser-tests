import {check} from '@augment-vir/assert';
import {filterMap} from '@augment-vir/common';
import {
    audioSumsForArch,
    osFingerprintReference,
    summarizeObservations,
    type FingerprintReferenceEntry,
} from './os-fingerprint-reference.js';
import {
    browserRandomizesAudio,
    computeAudioFingerprint,
    detectCpuArch,
    detectHyphenationDictionary,
    detectMathLibm,
    FingerprintVerdict,
    fingerprintVerdictLabels,
    getBrowserGroundTruth,
    OsFingerprintType,
    type BrowserGroundTruth,
    type CpuArchitecture,
    type HyphenationDictionary,
    type LibmSignature,
} from './os-fingerprints.js';

export type FingerprintComparison = Readonly<{
    type: OsFingerprintType;
    label: string;
    /** The live measured value, as a display string. */
    detected: string;
    /** Every value the claimed browser + OS is known to produce, as display strings. */
    expected: ReadonlyArray<string>;
    /** The browser randomizes this signal (Safari audio), so there is no value to expect. */
    randomized: boolean;
    verdict: FingerprintVerdict;
}>;

export type OsFingerprintReport = Readonly<{
    groundTruth: BrowserGroundTruth;
    /** The live CPU architecture, when the engine exposes it (Chromium only). */
    detectedCpuArch: CpuArchitecture | undefined;
    /** The reference row for the browser + OS the user agent claims, if it has been captured. */
    claimedReference: FingerprintReferenceEntry | undefined;
    comparisons: ReadonlyArray<FingerprintComparison>;
    /** When something mismatches, the browser + OS the measured fingerprints most resemble. */
    actualGuess: string | undefined;
}>;

const fingerprintLabels: Record<OsFingerprintType, string> = {
    [OsFingerprintType.Hyphenation]: 'hyphenation dictionary',
    [OsFingerprintType.MathLibm]: 'math libm signature',
    [OsFingerprintType.Audio]: 'audio fingerprint',
};

/**
 * Audio sums are bit-stable within a browser build on a given CPU architecture. A live sum is only
 * ever compared against same-architecture references, so this window just needs to absorb
 * stored-precision rounding (sums are stored to four decimals) and minor cross-version jitter while
 * still separating engine families (Firefox ~766 vs Chromium/WebKit ~956).
 */
const audioMatchTolerance = 0.0001;

/**
 * Weights for the actual-combo guess. Audio and hyphenation pin down the OS far more strongly than
 * the libm signature (glibc is shared by Linux and every Firefox), so they count for more.
 */
const guessWeights = {
    hyphenation: 2,
    audio: 2,
    libm: 1,
};

/**
 * Classifies a live value against every value the claimed browser + OS is known to produce, across
 * all captured versions (the exact version need not be in the reference):
 *
 * - Matches a value the claimed browser + OS produces → match.
 * - Detected, but not a value the claimed browser + OS produces → the user agent is lying.
 * - No live value, yet the claimed browser + OS does produce one → also a lie.
 * - No reference captured for the claimed browser + OS → nothing to compare.
 */
export function classifyFingerprint<Value>({
    live,
    claimedValues,
    isMatch,
}: Readonly<{
    live: Value | undefined;
    claimedValues: ReadonlyArray<Value>;
    isMatch: (candidate: Value) => boolean;
}>): FingerprintVerdict {
    if (claimedValues.length === 0) {
        return FingerprintVerdict.NoReference;
    } else if (live != undefined && claimedValues.some(isMatch)) {
        return FingerprintVerdict.Match;
    }
    return FingerprintVerdict.Mismatch;
}

export type DetectedFingerprints = Readonly<{
    hyphenation: HyphenationDictionary | undefined;
    libm: LibmSignature | undefined;
    audio: number | undefined;
}>;

function audioMatches({candidate, live}: Readonly<{candidate: number; live: number}>): boolean {
    return Math.abs(candidate - live) <= audioMatchTolerance;
}

/**
 * Scores how well one reference entry matches the measured fingerprints. Unlike the claimed-browser
 * verdict, the audio sum is compared against every captured architecture's sum rather than only the
 * detected one: this guess is computed precisely because the user agent is already lying, and a
 * user agent that fakes its platform string can just as trivially fake its `architecture` client
 * hint, whereas the audio sum comes from the real render pipeline and is far harder to forge.
 * Scoping by the arch here would let a spoofed hint discard the strongest honest signal (e.g. an
 * x86 Chromium audio sum reported alongside a faked `arm` hint, which with glibc uniquely
 * identifies Linux Chrome).
 */
function scoreEntryAgainstDetected({
    entry,
    detected,
}: Readonly<{entry: FingerprintReferenceEntry; detected: DetectedFingerprints}>): number {
    const summary = summarizeObservations(entry.observations);
    const liveAudio = detected.audio;
    const weightedMatches: ReadonlyArray<number> = [
        detected.hyphenation != undefined &&
        summary.hyphenationDictionaries.includes(detected.hyphenation)
            ? guessWeights.hyphenation
            : 0,
        detected.libm != undefined && summary.libmSignatures.includes(detected.libm)
            ? guessWeights.libm
            : 0,
        liveAudio != undefined &&
        summary.audioSums.some((sum) =>
            audioMatches({
                candidate: sum,
                live: liveAudio,
            }),
        )
            ? guessWeights.audio
            : 0,
    ];
    return weightedMatches.reduce((total, weight) => total + weight, 0);
}

/**
 * Finds the browser + OS (other than the one claimed) whose known fingerprints best match what was
 * actually measured, so a spoofed user agent can be told what it really looks like.
 */
export function guessActualCombo({
    detected,
    claimedOsName,
    claimedBrowserName,
}: Readonly<{
    detected: DetectedFingerprints;
    claimedOsName: string | undefined;
    claimedBrowserName: string | undefined;
}>): string | undefined {
    const scored = filterMap(
        osFingerprintReference,
        (entry) => {
            const isClaimed = entry.os === claimedOsName && entry.browser === claimedBrowserName;
            const score = isClaimed
                ? 0
                : scoreEntryAgainstDetected({
                      entry,
                      detected,
                  });
            return score > 0
                ? {
                      entry,
                      score,
                  }
                : undefined;
        },
        check.isDefined,
    );
    const best = scored.toSorted((first, second) => second.score - first.score)[0];
    return best ? `${best.entry.os} ${best.entry.browser}` : undefined;
}

export async function runOsFingerprints(): Promise<OsFingerprintReport> {
    const groundTruth = await getBrowserGroundTruth();
    const claimedReference = osFingerprintReference.find(
        (entry) => entry.os === groundTruth.osName && entry.browser === groundTruth.browserName,
    );
    const claimedSummary = summarizeObservations(claimedReference?.observations ?? []);

    const detectedCpuArch = await detectCpuArch();
    const hyphenation = detectHyphenationDictionary();
    const mathLibm = detectMathLibm();
    const audio = await computeAudioFingerprint();
    /** Safari and Brave both alter the audio render each session, so the sum is not comparable. */
    const audioRandomized = browserRandomizesAudio(groundTruth.browserName);

    /** Audio depends on CPU architecture, so it is only compared against same-architecture sums. */
    const claimedAudioSums = audioSumsForArch({
        observations: claimedReference?.observations ?? [],
        cpuArch: detectedCpuArch,
    });

    const comparisons: ReadonlyArray<FingerprintComparison> = [
        {
            type: OsFingerprintType.Hyphenation,
            label: fingerprintLabels[OsFingerprintType.Hyphenation],
            detected: hyphenation.detected ?? 'none',
            expected: claimedSummary.hyphenationDictionaries,
            randomized: false,
            verdict: classifyFingerprint({
                live: hyphenation.detected,
                claimedValues: claimedSummary.hyphenationDictionaries,
                isMatch: (candidate) => candidate === hyphenation.detected,
            }),
        },
        {
            type: OsFingerprintType.MathLibm,
            label: fingerprintLabels[OsFingerprintType.MathLibm],
            detected: mathLibm.detected ?? 'none',
            expected: claimedSummary.libmSignatures,
            randomized: false,
            verdict: classifyFingerprint({
                live: mathLibm.detected,
                claimedValues: claimedSummary.libmSignatures,
                isMatch: (candidate) => candidate === mathLibm.detected,
            }),
        },
        {
            type: OsFingerprintType.Audio,
            label: fingerprintLabels[OsFingerprintType.Audio],
            detected: audio == undefined ? 'none' : audio.sum.toFixed(4),
            expected: claimedAudioSums.map((sum) => sum.toFixed(4)),
            randomized: audioRandomized,
            /** Randomized audio has nothing stable to reference, so it is never comparable. */
            verdict: audioRandomized
                ? FingerprintVerdict.NoReference
                : classifyFingerprint({
                      live: audio?.sum,
                      claimedValues: claimedAudioSums,
                      isMatch: (candidate) =>
                          audio != undefined &&
                          audioMatches({
                              candidate,
                              live: audio.sum,
                          }),
                  }),
        },
    ];

    const hasMismatch = comparisons.some(
        (comparison) => comparison.verdict === FingerprintVerdict.Mismatch,
    );
    const actualGuess = hasMismatch
        ? guessActualCombo({
              detected: {
                  hyphenation: hyphenation.detected,
                  libm: mathLibm.detected,
                  audio: audioRandomized ? undefined : audio?.sum,
              },
              claimedOsName: groundTruth.osName,
              claimedBrowserName: groundTruth.browserName,
          })
        : undefined;

    return {
        groundTruth,
        detectedCpuArch,
        claimedReference,
        comparisons,
        actualGuess,
    };
}

/**
 * Renders the live report as plain text for the clipboard, so a fingerprint captured on another
 * machine (for example a coworker's browser) can be pasted back and added to the reference.
 */
export function formatOsFingerprintReport(report: OsFingerprintReport): string {
    const fingerprintLines = report.comparisons
        .toSorted((first, second) => first.label.localeCompare(second.label))
        .map((comparison) => {
            const detected = comparison.randomized ? 'randomized' : comparison.detected;
            const expected = comparison.randomized
                ? 'random'
                : comparison.expected.join(', ') || 'no reference';
            return `- ${comparison.label}: ${detected} (expected: ${expected}) → ${fingerprintVerdictLabels[comparison.verdict]}`;
        });
    const guessLines = report.actualGuess
        ? [
              '',
              `These fingerprints actually look like: ${report.actualGuess}`,
          ]
        : [];

    return [
        'OS Fingerprint Report',
        '',
        `User agent: ${report.groundTruth.userAgent}`,
        `OS: ${report.groundTruth.osName || 'unknown'}`,
        `Browser: ${report.groundTruth.browserName || 'unknown'}`,
        `Version: ${report.groundTruth.browserVersion || 'unknown'}`,
        `CPU architecture: ${report.detectedCpuArch || 'unknown'}`,
        '',
        'Fingerprints:',
        ...fingerprintLines,
        ...guessLines,
    ].join('\n');
}
