import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker';

interface MonacoEnvironmentShape {
  getWorker: (_moduleId: string, label: string) => Worker;
}

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironmentShape;
};

export function configureMonacoEnvironment(): void {
  const target = globalThis as MonacoGlobal;
  if (target.MonacoEnvironment) return;

  target.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'json') return new JsonWorker();
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new CssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new HtmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new TypeScriptWorker();
      }
      return new EditorWorker();
    },
  };
}
