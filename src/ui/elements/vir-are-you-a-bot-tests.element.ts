import {css, defineElement, html} from 'element-vir';
import {viraTheme} from 'vira';
import {
    botVerdictIcons,
    botVerdictLabels,
    runBotDetections,
    type BotReport,
} from '../../are-you-a-bot/are-you-a-bot-detections.js';
import {detectionRatingIcons} from '../../rebrowser/rebrowser-detections.js';
import {iconLabel, iconLabelStyles} from './icon-label.js';
import {testPanelStyles} from './shared-styles.js';

function renderSignals(report: BotReport) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>Signal</th>
                    <th>Result</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
                ${report.signals
                    .toSorted((first, second) => first.label.localeCompare(second.label))
                    .map(
                        (signal) => html`
                            <tr>
                                <td>
                                    ${iconLabel({
                                        icon: detectionRatingIcons[signal.rating],
                                        label: signal.label,
                                    })}
                                </td>
                                <td>${signal.rating}</td>
                                <td>
                                    ${signal.note}
                                    ${signal.debug
                                        ? html`
                                              <pre class="debug">${signal.debug}</pre>
                                          `
                                        : ''}
                                </td>
                            </tr>
                        `,
                    )}
            </tbody>
        </table>
    `;
}

export const VirAreYouABotTests = defineElement()({
    tagName: 'vir-are-you-a-bot-tests',
    styles: css`
        :host {
            display: block;
        }

        ${testPanelStyles}
        ${iconLabelStyles}

        .verdict {
            margin-top: 16px;
            padding: 12px 16px;
            font-size: 18px;
            font-weight: bold;
            border-radius: 8px;
            background: ${viraTheme.colors['vira-grey-behind-fg-small-body'].background.value};
        }

        .debug {
            margin: 4px 0 0;
            padding: 8px;
            overflow: auto;
            font-size: 12px;
            white-space: pre-wrap;
            background: ${viraTheme.colors['vira-grey-behind-bg-lowest-contrast'].background.value};
        }
    `,
    state: () => {
        return {
            report: undefined as BotReport | undefined,
        };
    },
    init({updateState}) {
        void runBotDetections().then((report) => {
            updateState({
                report,
            });
        });
    },
    render({state}) {
        const report = state.report;

        return html`
            <h1>Are You a Bot</h1>
            ${report
                ? html`
                      <div class="verdict">
                          ${iconLabel({
                              icon: botVerdictIcons[report.verdict],
                              label: botVerdictLabels[report.verdict],
                          })}
                      </div>
                      ${renderSignals(report)}
                  `
                : html`
                      <p>Running…</p>
                  `}
        `;
    },
});
