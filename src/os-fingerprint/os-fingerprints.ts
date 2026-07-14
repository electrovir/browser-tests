// cspell:words libm glibc ucrt minikin fdlibm libsystem tanh atob kansainvälistyminen constitutionalibus scrapfly spoofable aosp hyphenator

import {assertWrap, check} from '@augment-vir/assert';
import {getObjectTypedKeys} from '@augment-vir/common';
import Bowser from 'bowser';

/**
 * Side-channel OS/CPU fingerprints ported from the Scrapfly write-ups. Each one measures browser
 * behavior that reveals the real operating system, CPU architecture, or engine. The measurement is
 * then checked against a reference of what the browser + OS the user agent _claims_ should produce:
 * if the fingerprint belongs to a different browser + OS, the user agent is lying.
 *
 * - Hyphenation: https://scrapfly.dev/posts/browser-hyphenation-os-fingerprint/
 * - Math libm: https://scrapfly.dev/posts/browser-math-os-fingerprint/
 * - Audio: https://scrapfly.dev/posts/audio-fingerprint-math/
 * - WebAssembly CPU architecture: https://scrapfly.dev/posts/wasm-cpu-architecture-leak/
 */
export enum OsFingerprintType {
    Hyphenation = 'hyphenation',
    MathLibm = 'mathLibm',
    Audio = 'audio',
    CpuArchitecture = 'cpuArchitecture',
}

export enum CpuArchitecture {
    X86 = 'x86',
    Arm = 'arm',
}

/** The source of a browser's hyphenation dictionaries. */
export enum HyphenationDictionary {
    /** MacOS and iOS: Apple CoreFoundation dictionaries (hyphenate Finnish, not Latin). */
    Apple = 'apple',
    /** Windows, Linux, Android, ChromeOS: AOSP Minikin dictionaries (hyphenate Latin, not Finnish). */
    Minikin = 'minikin',
    /**
     * The browser ships its own dictionaries instead of using the OS hyphenator (Firefox hyphenates
     * both Finnish and Latin everywhere), so hyphenation reveals nothing about the operating
     * system.
     */
    Bundled = 'bundled',
}

/** The C math library a JS engine's `Math.tanh` routes to, distinguishable by its exact rounding. */
export enum LibmSignature {
    /** Linux glibc. Also the signature of the fdlibm implementation Firefox bundles everywhere. */
    Glibc = 'glibc',
    /** MacOS libsystem_m. */
    AppleLibm = 'appleLibm',
    /** Windows UCRT. */
    Ucrt = 'ucrt',
}

/** How a live fingerprint compares to the reference for the browser + OS the user agent claims. */
export enum FingerprintVerdict {
    /** The live value is a known value for the claimed browser + OS. */
    Match = 'match',
    /** The live value is a known value for a _different_ browser + OS: the user agent is lying. */
    Mismatch = 'mismatch',
    /**
     * The live value is in no reference set, so it can neither be confirmed nor proven a lie — most
     * likely a browser version we have not captured yet.
     */
    Unverified = 'unverified',
    /** No reference has been captured for the claimed browser + OS, so there is nothing to compare. */
    NoReference = 'noReference',
}

export const fingerprintVerdictIcons: Record<FingerprintVerdict, string> = {
    [FingerprintVerdict.Match]: '🟢',
    [FingerprintVerdict.Mismatch]: '🔴',
    [FingerprintVerdict.Unverified]: '🟡',
    [FingerprintVerdict.NoReference]: '⚪️',
};

export const fingerprintVerdictLabels: Record<FingerprintVerdict, string> = {
    [FingerprintVerdict.Match]: 'match',
    [FingerprintVerdict.Mismatch]: 'mismatch',
    [FingerprintVerdict.Unverified]: 'unverified (no reference for this browser version)',
    [FingerprintVerdict.NoReference]: 'no reference',
};

export type BrowserGroundTruth = Readonly<{
    userAgent: string;
    /** Bowser `os.name`, e.g. 'macOS', 'Windows', 'Linux', 'iOS', 'Android', 'Chrome OS'. */
    osName: string | undefined;
    /** Bowser `browser.name`, e.g. 'Chrome', 'Safari', 'Firefox'. */
    browserName: string | undefined;
    /** Bowser `browser.version`, e.g. '149.0.0.0'. */
    browserVersion: string | undefined;
}>;

export function getBrowserGroundTruth(): BrowserGroundTruth {
    const parsed = Bowser.parse(navigator.userAgent);
    return {
        userAgent: navigator.userAgent,
        osName: parsed.os.name,
        browserName: parsed.browser.name,
        browserVersion: parsed.browser.version,
    };
}

export type HyphenationResult = Readonly<{
    finnishAutoHeight: number;
    finnishBaselineHeight: number;
    latinAutoHeight: number;
    latinBaselineHeight: number;
    /** Apple ships a Finnish dictionary; Minikin does not. */
    finnishHyphenates: boolean;
    /** Minikin ships a Latin dictionary; Apple does not. */
    latinHyphenates: boolean;
    detected: HyphenationDictionary | undefined;
}>;

const hyphenationFontSizePx = 20;
const finnishProbeWord = 'kansainvälistyminen';
const latinProbeWord = 'constitutionalibus';

/** Renders `word` in a narrow box and returns its rendered height in pixels. */
function measureWrapHeight({
    lang,
    word,
    enableHyphens,
}: Readonly<{lang: string; word: string; enableHyphens: boolean}>): number {
    const hyphensValue = enableHyphens ? 'auto' : 'none';
    const element = document.createElement('div');
    element.setAttribute('lang', lang);
    element.style.cssText = [
        'position:absolute',
        'left:-9999px',
        'top:0',
        'width:6ch',
        `font:${hyphenationFontSizePx}px serif`,
        `hyphens:${hyphensValue}`,
        `-webkit-hyphens:${hyphensValue}`,
        'overflow-wrap:normal',
        'word-break:normal',
    ].join(';');
    element.textContent = word;
    document.body.append(element);
    const height = element.getBoundingClientRect().height;
    element.remove();
    return height;
}

/**
 * Compares the word's height with hyphenation enabled against its single-line baseline. A jump to
 * roughly double the height means the browser broke it across lines, which only happens when a
 * hyphenation dictionary exists for that language.
 */
function probeHyphenation({lang, word}: Readonly<{lang: string; word: string}>): Readonly<{
    autoHeight: number;
    baselineHeight: number;
    hyphenates: boolean;
}> {
    const autoHeight = measureWrapHeight({
        lang,
        word,
        enableHyphens: true,
    });
    const baselineHeight = measureWrapHeight({
        lang,
        word,
        enableHyphens: false,
    });
    return {
        autoHeight,
        baselineHeight,
        hyphenates: autoHeight > baselineHeight * 1.5,
    };
}

function dictionaryFromProbes({
    finnishHyphenates,
    latinHyphenates,
}: Readonly<{finnishHyphenates: boolean; latinHyphenates: boolean}>):
    | HyphenationDictionary
    | undefined {
    if (finnishHyphenates && latinHyphenates) {
        /** Both wrap only when the browser ships its own comprehensive dictionaries (Firefox). */
        return HyphenationDictionary.Bundled;
    } else if (!finnishHyphenates && !latinHyphenates) {
        /** Neither wraps: the browser has no dictionary for these languages at all. */
        return undefined;
    }
    return finnishHyphenates ? HyphenationDictionary.Apple : HyphenationDictionary.Minikin;
}

export function detectHyphenationDictionary(): HyphenationResult {
    const finnish = probeHyphenation({
        lang: 'fi',
        word: finnishProbeWord,
    });
    const latin = probeHyphenation({
        lang: 'la',
        word: latinProbeWord,
    });
    return {
        finnishAutoHeight: finnish.autoHeight,
        finnishBaselineHeight: finnish.baselineHeight,
        latinAutoHeight: latin.autoHeight,
        latinBaselineHeight: latin.baselineHeight,
        finnishHyphenates: finnish.hyphenates,
        latinHyphenates: latin.hyphenates,
        detected: dictionaryFromProbes({
            finnishHyphenates: finnish.hyphenates,
            latinHyphenates: latin.hyphenates,
        }),
    };
}

export type MathLibmResult = Readonly<{
    /** `Math.tanh(0.5)`, identical across every known libm; a sanity anchor, not a discriminator. */
    anchorTanh: number;
    /** `Math.tanh` at the discriminating inputs 0.7, 0.8, and 0.9. */
    probeTanh: ReadonlyArray<number>;
    detected: LibmSignature | undefined;
}>;

const tanhAnchorInput = 0.5;
export const tanhAnchorValue = 0.46211715726000974;
const tanhProbeInputs: ReadonlyArray<number> = [
    0.7,
    0.8,
    0.9,
];

/** Exact `Math.tanh(0.7)`, `Math.tanh(0.8)`, `Math.tanh(0.9)` outputs per libm implementation. */
const libmTanhSignatures: Record<LibmSignature, ReadonlyArray<number>> = {
    [LibmSignature.Glibc]: [
        0.6043677771171636,
        0.6640367702678491,
        0.7162978701990245,
    ],
    [LibmSignature.AppleLibm]: [
        0.6043677771171635,
        0.664036770267849,
        0.7162978701990245,
    ],
    [LibmSignature.Ucrt]: [
        0.6043677771171635,
        0.6640367702678489,
        0.7162978701990244,
    ],
};

function libmFromTanh(measured: ReadonlyArray<number>): LibmSignature | undefined {
    return getObjectTypedKeys(libmTanhSignatures).find((signature) =>
        libmTanhSignatures[signature].every((value, index) => value === measured[index]),
    );
}

export function detectMathLibm(): MathLibmResult {
    const probeTanh = tanhProbeInputs.map((input) => Math.tanh(input));
    return {
        anchorTanh: Math.tanh(tanhAnchorInput),
        probeTanh,
        detected: libmFromTanh(probeTanh),
    };
}

export type AudioFingerprintResult = Readonly<{
    /** Sum of absolute rendered sample values. Deterministic per engine + CPU architecture. */
    sum: number;
    sampleCount: number;
}>;

const audioSampleCount = 5000;
const audioSampleRate = 44_100;

/**
 * Renders a triangle oscillator through a dynamics compressor offline and sums the output. The
 * result is bit-stable within a browser build; Firefox is far from Chromium/WebKit, which sit close
 * together, so it separates engine families more than individual browsers.
 */
export async function computeAudioFingerprint(): Promise<AudioFingerprintResult> {
    const context = new OfflineAudioContext(1, audioSampleCount, audioSampleRate);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 1000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.2;
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start();
    const buffer = await context.startRendering();
    const samples = buffer.getChannelData(0);
    return {
        sum: samples.reduce((total, sample) => total + Math.abs(sample), 0),
        sampleCount: samples.length,
    };
}

export type CpuArchitectureResult = Readonly<{
    /** NaN sign bit read from a WebAssembly module's linear memory, or undefined if it failed. */
    wasmSignBit: number | undefined;
    /** NaN sign bit read from a plain-JS `0 / 0` through a typed-array alias. */
    jsSignBit: number;
    detected: CpuArchitecture;
    /**
     * True when the WASM and JS probes agree. They legitimately differ on some engines (e.g.
     * Firefox) that canonicalize the NaN sign bit for plain-JS `0 / 0`, which is why the WASM probe
     * is the authoritative source.
     */
    probesAgree: boolean;
}>;

/**
 * A tiny WebAssembly module exporting `(func "sign" (param f64) (result i32))` that computes `x /
 * x`, stores the f64 result into linear memory, and returns the sign bit of its high 32-bit word.
 * Calling it with 0 produces 0/0, whose NaN sign bit the CPU chooses: 1 on x86, 0 on ARM. Reading
 * the raw bytes out of linear memory sidesteps NaN canonicalization at the WASM/JS boundary.
 */
const cpuArchitectureWasmBase64 =
    'AGFzbQEAAAABBgFgAXwBfwMCAQAFAwEAAQcIAQRzaWduAAAKFgEUAEEAIAAgAKM5AwBBBCgCAEEfdgs=';

function readWasmNanSignBit(): number | undefined {
    try {
        const bytes = Uint8Array.from(
            atob(cpuArchitectureWasmBase64),
            (character) => character.codePointAt(0) ?? 0,
        );
        const signExport = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.sign;
        if (!check.isFunction(signExport)) {
            return undefined;
        }
        return (signExport as (value: number) => number)(0);
    } catch {
        return undefined;
    }
}

function readJsNanSignBit(): number {
    const zeroHolder = new Float64Array(1);
    zeroHolder[0] = 0;
    /** Reading the zeros back through the array stops the optimizer from constant-folding `0 / 0`. */
    const numerator = assertWrap.isNumber(zeroHolder[0]);
    const denominator = assertWrap.isNumber(zeroHolder[0]);
    const nanBits = new Float64Array([numerator / denominator]);
    /** Index 1 is the high 32-bit word on little-endian CPUs (both x86-64 and arm64). */
    const highWord = assertWrap.isNumber(new Uint32Array(nanBits.buffer)[1]);
    return highWord >>> 31;
}

function architectureFromSignBit(signBit: number): CpuArchitecture {
    return signBit === 1 ? CpuArchitecture.X86 : CpuArchitecture.Arm;
}

export function detectCpuArchitecture(): CpuArchitectureResult {
    const wasmSignBit = readWasmNanSignBit();
    const jsSignBit = readJsNanSignBit();
    return {
        wasmSignBit,
        jsSignBit,
        detected: architectureFromSignBit(wasmSignBit ?? jsSignBit),
        probesAgree: wasmSignBit == undefined || wasmSignBit === jsSignBit,
    };
}
