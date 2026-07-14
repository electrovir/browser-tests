// cspell:words libm

import {css, defineElement, html} from 'element-vir';
import {viraTheme} from 'vira';
import {
    osFingerprintReference,
    summarizeObservations,
    type FingerprintReferenceEntry,
} from '../../os-fingerprint/os-fingerprint-reference.js';
import {
    runOsFingerprints,
    type OsFingerprintReport,
} from '../../os-fingerprint/os-fingerprint-report.js';
import {
    fingerprintVerdictIcons,
    fingerprintVerdictLabels,
} from '../../os-fingerprint/os-fingerprints.js';
import {iconLabel} from './icon-label.js';
import {testPanelStyles} from './shared-styles.js';

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
                    <th>fingerprint</th>
                    <th>detected</th>
                    <th>expected for claimed browser</th>
                    <th>result</th>
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
                                <td>${renderValues(comparison.expected)}</td>
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

function renderReferenceRow({
    entry,
    isCurrent,
}: Readonly<{entry: FingerprintReferenceEntry; isCurrent: boolean}>) {
    const summary = summarizeObservations(entry.observations);
    const cells: ReadonlyArray<ReadonlyArray<string>> = [
        summary.hyphenationDictionaries,
        summary.libmSignatures,
        summary.audioSums.map((sum) => sum.toFixed(4)),
        summary.cpuArchitectures,
    ];

    return html`
        <tr class=${isCurrent ? 'current' : ''}>
            <td>${entry.os} ${entry.browser}${isCurrent ? ' (this browser)' : ''}</td>
            ${cells.map(
                (cell) => html`
                    <td>${renderValues(cell)}</td>
                `,
            )}
        </tr>
    `;
}

function renderReferenceTable(report: OsFingerprintReport) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>os + browser</th>
                    <th>hyphenation</th>
                    <th>libm</th>
                    <th>audio sum</th>
                    <th>cpu</th>
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
    `,
    state: () => {
        return {
            report: undefined as OsFingerprintReport | undefined,
        };
    },
    init({updateState}) {
        void runOsFingerprints().then((report) => {
            updateState({
                report,
            });
        });
    },
    render({state}) {
        const report = state.report;

        return html`
            <h1>os fingerprint</h1>
            <p>
                Measures side channels (
                <code>hyphens: auto</code>
                dictionaries, libm rounding, an audio render, and the NaN sign bit) and checks each
                against a reference of what the browser + OS the user agent claims should produce. A
                value that instead belongs to a different browser + OS is how a spoofed user agent
                gets caught.
            </p>
            ${report
                ? html`
                      <code class="user-agent">${report.groundTruth.userAgent}</code>
                      <h2>this browser</h2>
                      ${renderLiveResults(report)}
                      <h2>reference (per os + browser)</h2>
                      ${renderReferenceTable(report)}
                  `
                : html`
                      <p>Running fingerprints…</p>
                  `}
        `;
    },
});
