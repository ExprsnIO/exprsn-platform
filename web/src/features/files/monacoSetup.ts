/**
 * Monaco loader + Vite web-worker wiring for the in-browser editor.
 *
 * Single-origin app, NO external CDN: @monaco-editor/react defaults to loading
 * Monaco from jsdelivr. We override `loader.config({ monaco })` so it uses the
 * locally-bundled `monaco-editor`, and point MonacoEnvironment at Vite-bundled
 * web workers (the `?worker` imports) so language services run without console
 * errors. Imported once for side effects from FileEditor.tsx.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html') return new htmlWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

export {};
