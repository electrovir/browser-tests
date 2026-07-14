import {css, defineElement, html} from 'element-vir';
import {viraTheme} from 'vira';
import {
    detectionRatingIcons,
    startRebrowserDetections,
    type RebrowserDetection,
} from '../../rebrowser/rebrowser-detections.js';
import {iconLabel, iconLabelStyles} from './icon-label.js';
import {testPanelStyles} from './shared-styles.js';

function renderRebrowserDetections(detections: ReadonlyArray<RebrowserDetection>) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>Test</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
                ${detections
                    .toSorted((first, second) => first.type.localeCompare(second.type))
                    .map(
                        (detection) => html`
                            <tr>
                                <td>
                                    ${iconLabel({
                                        icon: detectionRatingIcons[detection.rating],
                                        label: detection.type,
                                    })}
                                </td>
                                <td>
                                    ${detection.note}
                                    ${detection.debug
                                        ? html`
                                              <pre class="debug">${detection.debug}</pre>
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

export const VirRebrowserTests = defineElement()({
    tagName: 'vir-rebrowser-tests',
    styles: css`
        :host {
            display: block;
        }

        ${testPanelStyles}
        ${iconLabelStyles}

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
            detections: [] as ReadonlyArray<RebrowserDetection>,
        };
    },
    init({updateState}) {
        startRebrowserDetections((detections) => {
            updateState({
                detections,
            });
        });
    },
    render({state}) {
        return html`
            <h1>Playwright Bot Detection</h1>
            <p>
                The tests run continuously; some only resolve once an automation tool triggers them.
                The latest results are also written to
                <code>window.rebrowserDetections</code>
                for automation.
            </p>
            ${renderRebrowserDetections(state.detections)}
        `;
    },
});
