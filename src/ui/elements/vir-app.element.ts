import {css, defineElement, html} from 'element-vir';
import {
    PersistenceMode,
    runPersistenceTests,
    type PersistenceRunResult,
} from '../../persistence/run-persistence-tests.js';

declare global {
    interface Window {
        /** Populated once a seed/verify run finishes, so automation can read the result. */
        persistenceTestResult?: PersistenceRunResult | undefined;
    }
}

enum RunStatus {
    Idle = 'idle',
    Running = 'running',
    Done = 'done',
}

function parseMode(search: string): PersistenceMode | undefined {
    const modeParam = new URLSearchParams(search).get('mode');
    return Object.values(PersistenceMode).find((candidate) => candidate === modeParam);
}

function renderResult(result: PersistenceRunResult) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>mechanism</th>
                    <th>${result.mode}</th>
                </tr>
            </thead>
            <tbody>
                ${result.reports.map(
                    (report) => html`
                        <tr>
                            <td>${report.label}</td>
                            <td>
                                ${report.ok ? '✅' : '❌'}
                                ${report.error
                                    ? html`
                                          <span class="error">${report.error}</span>
                                      `
                                    : ''}
                            </td>
                        </tr>
                    `,
                )}
            </tbody>
        </table>
        <pre class="json">${JSON.stringify(result, undefined, 2)}</pre>
    `;
}

export const VirApp = defineElement()({
    tagName: 'vir-app',
    styles: css`
        :host {
            display: block;
            padding: 24px;
            max-width: 820px;
            font-family: sans-serif;
        }

        code {
            font-family: monospace;
        }

        nav {
            display: flex;
            gap: 16px;
            margin: 16px 0;
        }

        table {
            border-collapse: collapse;
            margin-top: 16px;
        }

        th,
        td {
            padding: 4px 12px;
            border: 1px solid #ccc;
            text-align: left;
        }

        .error {
            color: #b00020;
            font-family: monospace;
        }

        .json {
            margin-top: 16px;
            padding: 12px;
            overflow: auto;
            background: #f5f5f5;
        }
    `,
    state: () => {
        const params = new URLSearchParams(window.location.search);
        return {
            status: RunStatus.Idle,
            marker: params.get('marker') || crypto.randomUUID(),
            result: undefined as PersistenceRunResult | undefined,
        };
    },
    init({state, updateState}) {
        const mode = parseMode(window.location.search);
        if (!mode) {
            return;
        }
        updateState({
            status: RunStatus.Running,
        });
        void runPersistenceTests({
            mode,
            marker: state.marker,
        }).then((result) => {
            window.persistenceTestResult = result;
            document.title = `Browser Persistence Test — ${mode} complete`;
            updateState({
                status: RunStatus.Done,
                result,
            });
        });
    },
    render({state}) {
        return html`
            <h1>Browser Persistence Test</h1>
            <p>
                Seeds a unique marker into every browser persistence mechanism, then reads it back
                in a separate session to see which ones survive. Drive it with
                <code>?mode=seed&marker=…</code>
                then
                <code>?mode=verify&marker=…</code>
                ; the JSON result is also written to
                <code>window.persistenceTestResult</code>
                for automation.
            </p>
            <p>
                current marker:
                <code>${state.marker}</code>
            </p>
            <nav>
                <a href="?mode=${PersistenceMode.Seed}&marker=${state.marker}">Run seed</a>
                <a href="?mode=${PersistenceMode.Verify}&marker=${state.marker}">Run verify</a>
            </nav>
            ${state.status === RunStatus.Running
                ? html`
                      <p>Running…</p>
                  `
                : ''}
            ${state.result ? renderResult(state.result) : ''}
        `;
    },
});
