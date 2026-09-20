import { useEffect, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import { useIsDark } from '../theme';
import { useCopy } from '../clipboard';

// Curated language set — each is a lazy chunk, fetched on first use.
const LANG_MODULES = {
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

const ALIASES = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  js: 'javascript',
  ts: 'typescript',
  md: 'markdown',
  'c++': 'cpp',
  cs: 'csharp',
  dockerfile: 'docker',
  text: 'plaintext',
  txt: 'plaintext',
  '': 'plaintext',
};

let highlighterPromise = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

const loaded = new Set();
async function ensureLanguage(highlighter, lang) {
  if (lang === 'plaintext' || loaded.has(lang)) return;
  const loader = LANG_MODULES[lang];
  if (!loader) return; // unknown language falls back to plaintext
  const mod = await loader();
  await highlighter.loadLanguage(mod.default);
  loaded.add(lang);
}

function usePrefersDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

function CopyBar({ getText }) {
  const [copied, doCopy] = useCopy();
  return (
    <div className="absolute right-2 top-2 z-10 flex opacity-0 transition-opacity group-hover/code:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
      <button
        onClick={() => doCopy(getText())}
        title="Copy"
        aria-label="Copy code"
        className="rounded-md border border-neutral-200 bg-white/90 px-2 py-1 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-white"
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

export default function CodeBlock({ code, lang }) {
  const [html, setHtml] = useState(null);
  const dark = useIsDark();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resolved = ALIASES[String(lang).toLowerCase()] ?? String(lang).toLowerCase();
        const highlighter = await getHighlighter();
        await ensureLanguage(highlighter, resolved);
        const out = highlighter.codeToHtml(code, {
          lang: LANG_MODULES[resolved] || loaded.has(resolved) ? resolved : 'plaintext',
          theme: dark ? 'github-dark' : 'github-light',
        });
        if (alive) setHtml(out);
      } catch {
        if (alive) setHtml(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, lang, dark]);

  if (html) {
    return (
      <div className="group/code relative not-prose my-5">
        <CopyBar getText={() => code} />
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }
  return (
    <div className="group/code relative not-prose my-5">
      <CopyBar getText={() => code} />
      <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 text-[13px] leading-relaxed dark:bg-neutral-900">
        <code>{code}</code>
      </pre>
    </div>
  );
}
