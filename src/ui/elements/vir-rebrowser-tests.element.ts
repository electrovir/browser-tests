import {css, defineElement, html} from 'element-vir';
import {
    detectionRatingIcons,
    startRebrowserDetections,
    type RebrowserDetection,
} from '../../rebrowser/rebrowser-detections.js';
import {testPanelStyles} from './shared-styles.js';

function renderRebrowserDetections(detections: ReadonlyArray<RebrowserDetection>) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>test</th>
                    <th>time</th>
                    <th>notes</th>
                </tr>
            </thead>
            <tbody>
                ${detections.map(
                    (detection) => html`
                        <tr>
                            <td>${detectionRatingIcons[detection.rating]} ${detection.type}</td>
                            <td>${detection.msSinceLoad} ms</td>
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

        .debug {
            margin: 4px 0 0;
            padding: 8px;
            overflow: auto;
            font-size: 12px;
            white-space: pre-wrap;
            background: #f5f5f5;
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
            <h1>rebrowser bot detection</h1>
            <p>
                Ports the automation-detection tests from
                <code>bot-detector.rebrowser.net</code>
                . They run continuously; some only resolve once an automation tool triggers them.
                The latest results are also written to
                <code>window.rebrowserDetections</code>
                for automation.
            </p>
            ${renderRebrowserDetections(state.detections)}
        `;
    },
});
