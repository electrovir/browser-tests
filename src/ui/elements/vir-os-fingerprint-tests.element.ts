import {wait} from '@augment-vir/common';
import {css, defineElement, html, listen} from 'element-vir';
import {viraTheme} from 'vira';
import {
    osFingerprintReference,
    summarizeObservations,
    type FingerprintReferenceEntry,
} from '../../os-fingerprint/os-fingerprint-reference.js';
import {
    formatOsFingerprintReport,
    runOsFingerprints,
    type OsFingerprintReport,
} from '../../os-fingerprint/os-fingerprint-report.js';
import {
    browserRandomizesAudio,
    fingerprintVerdictIcons,
    fingerprintVerdictLabels,
} from '../../os-fingerprint/os-fingerprints.js';
import {iconLabel, iconLabelStyles} from './icon-label.js';
import {testPanelStyles} from './shared-styles.js';

/** Shown wherever an audio sum would be, for browsers that randomize it (Safari and Brave). */
const randomizedAudioLabel = iconLabel({
    icon: '🎲',
    label: 'random',
});

function renderValues(values: ReadonlyArray<string>) {
    return values.length === 0
        ? html`
              <span class="placeholder">TBD</span>
          `
        : values.join(', ');
}

function renderLiveResults(report: OsFingerprintReport) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>Fingerprint</th>
                    <th>Detected</th>
                    <th>Expected for Claimed Browser</th>
                    <th>Result</th>
                </tr>
            </thead>
            <tbody>
                ${report.comparisons
                    .toSorted((first, second) => first.label.localeCompare(second.label))
                    .map(
                        (comparison) => html`
                            <tr>
                                <td>${comparison.label}</td>
                                <td>${comparison.detected}</td>
                                <td>
                                    ${comparison.randomized
                                        ? randomizedAudioLabel
                                        : renderValues(comparison.expected)}
                                </td>
                                <td>
                                    ${iconLabel({
                                        icon: fingerprintVerdictIcons[comparison.verdict],
                                        label: fingerprintVerdictLabels[comparison.verdict],
                                    })}
                                </td>
                            </tr>
                        `,
                    )}
            </tbody>
        </table>
    `;
}

function renderDetectedTable(report: OsFingerprintReport) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>OS</th>
                    <th>Browser</th>
                    <th>Version</th>
                    <th>CPU Arch</th>
                    <th>Installed Marker Fonts</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${report.groundTruth.osName || 'unknown'}</td>
                    <td>${report.groundTruth.browserName || 'unknown'}</td>
                    <td>${report.groundTruth.browserVersion || 'unknown'}</td>
                    <td>${report.detectedCpuArch || 'unknown'}</td>
                    <td>${renderValues(report.installedFonts)}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function renderReferenceRow({
    entry,
    isCurrent,
}: Readonly<{entry: FingerprintReferenceEntry; isCurrent: boolean}>) {
    const summary = summarizeObservations(entry.observations);
    const id = [
        entry.os,
        entry.browser,
        summary.cpuArchitectures.join('/'),
    ]
        .filter((part) => part.length > 0)
        .join(' ');
    const cells: ReadonlyArray<ReadonlyArray<string>> = [
        summary.hyphenationDictionaries,
        summary.fontPlatforms,
        summary.libmSignatures,
    ];

    return html`
        <tr class=${isCurrent ? 'current' : ''}>
            <td>${id}${isCurrent ? ' (this browser)' : ''}</td>
            ${cells.map(
                (cell) => html`
                    <td>${renderValues(cell)}</td>
                `,
            )}
            <td>
                ${browserRandomizesAudio(entry.browser)
                    ? randomizedAudioLabel
                    : renderValues(summary.audioSums.map((sum) => sum.toFixed(4)))}
            </td>
        </tr>
    `;
}

function renderReferenceTable(report: OsFingerprintReport) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>Id</th>
                    <th>Hyphenation</th>
                    <th>Fonts</th>
                    <th>Libm</th>
                    <th>Audio Sum</th>
                </tr>
            </thead>
            <tbody>
                ${osFingerprintReference
                    .toSorted((first, second) =>
                        `${first.os} ${first.browser}`.localeCompare(
                            `${second.os} ${second.browser}`,
                        ),
                    )
                    .map((entry) =>
                        renderReferenceRow({
                            entry,
                            isCurrent:
                                entry.os === report.groundTruth.osName &&
                                entry.browser === report.groundTruth.browserName,
                        }),
                    )}
            </tbody>
        </table>
    `;
}

export const VirOsFingerprintTests = defineElement()({
    tagName: 'vir-os-fingerprint-tests',
    styles: css`
        :host {
            display: block;
        }

        ${testPanelStyles}
        ${iconLabelStyles}

        .user-agent {
            display: block;
            margin-top: 8px;
            font-size: 12px;
            word-break: break-all;
        }

        h2 {
            margin-top: 24px;
            font-size: 16px;
        }

        tr.current {
            font-weight: bold;
            background: ${viraTheme.colors['vira-blue-behind-fg-small-body'].background.value};
        }

        .placeholder {
            color: ${viraTheme.colors['vira-grey-foreground-placeholder'].foreground.value};
        }

        .guess {
            margin-top: 16px;
            padding: 12px 16px;
            border-radius: 8px;
            background: ${viraTheme.colors['vira-red-behind-fg-small-body'].background.value};
        }
    `,
    state: () => {
        return {
            report: undefined as OsFingerprintReport | undefined,
            copied: false,
        };
    },
    init({updateState}) {
        void runOsFingerprints().then((report) => {
            updateState({
                report,
            });
        });
    },
    render({state, updateState}) {
        const report = state.report;

        return html`
            <h1>OS Fingerprint</h1>
            <button
                ?disabled=${!report}
                ${listen('click', async () => {
                    if (!report) {
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(formatOsFingerprintReport(report));
                        updateState({
                            copied: true,
                        });
                        await wait({
                            milliseconds: 2000,
                        });
                        updateState({
                            copied: false,
                        });
                    } catch {
                        /** The clipboard API is unavailable outside secure contexts; ignore here. */
                    }
                })}
            >
                ${state.copied ? 'Copied!' : 'Copy Report'}
            </button>
            ${report
                ? html`
                      <code class="user-agent">${report.groundTruth.userAgent}</code>
                      <h2>This Browser</h2>
                      ${renderLiveResults(report)}
                      <h2>Detected</h2>
                      ${renderDetectedTable(report)}
                      ${report.actualGuess
                          ? html`
                                <p class="guess">
                                    ${iconLabel({
                                        icon: '⚠️',
                                        label: 'These fingerprints actually look like',
                                    })}
                                    <strong>${report.actualGuess}</strong>
                                    .
                                </p>
                            `
                          : ''}
                      <h2>Reference</h2>
                      ${renderReferenceTable(report)}
                  `
                : html`
                      <p>Running fingerprints…</p>
                  `}
        `;
    },
});
