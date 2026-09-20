import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rawUrl, viewUrl } from '../api';
import { copyText } from '../clipboard';
import { createSlugger } from '../markdownOutline';
import CodeBlock from './CodeBlock';

const EXTERNAL = /^(https?:|mailto:|tel:|data:image\/)/;
const MD_EXT = /\.(md|markdown)$/i;

/**
 * Resolve repo-relative paths against the directory of the current file.
 * Returns a normalized POSIX-ish relative path from the repo root.
 */
function normalizeRel(target, baseDir) {
  const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function AnchorIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// Flatten rendered heading children (text, emphasis, code, …) to plain text.
function toText(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node.props?.children !== undefined) return toText(node.props.children);
  return '';
}

export default function MarkdownView({ path, content, onNavigate }) {
  const [copiedId, setCopiedId] = useState(null);
  // One slugger per document render keeps heading ids in sync with the
  // outline extracted from the raw source (same dedupe order).
  const slug = useMemo(() => createSlugger(), [content]);

  // Deep links: /view/docs/x.md#section — scroll once the headings exist.
  // A second pass after a tick catches late layout (images, fonts).
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return undefined;
    const scroll = () => document.getElementById(hash)?.scrollIntoView();
    scroll();
    const t = setTimeout(scroll, 300);
    return () => clearTimeout(t);
  }, [content]);

  const copyAnchor = async (id) => {
    const url = `${window.location.href.split('#')[0]}#${id}`;
    history.replaceState(null, '', `#${id}`);
    if (await copyText(url)) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    }
  };

  const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

  // Route relative refs through the appropriate endpoint:
  // .md links open in the viewer, everything else (images, pdfs, …) via /api/raw.
  const urlTransform = (url) => {
    if (url.startsWith('#') || EXTERNAL.test(url)) return url;
    const hashIndex = url.indexOf('#');
    const target = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
    if (!target) return url;
    const rel = normalizeRel(target.startsWith('/') ? target.slice(1) : target, target.startsWith('/') ? '' : baseDir);
    if (!rel) return url;
    return MD_EXT.test(rel) ? viewUrl(rel) + hash : rawUrl(rel) + hash;
  };

  const components = {
    ...Object.fromEntries(
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => [
        tag,
        function Heading({ children }) {
          const id = slug(toText(children));
          const Tag = tag;
          return (
            <Tag id={id} className="group scroll-mt-6">
              {children}
              <button
                onClick={() => copyAnchor(id)}
                title="Copy link to this section"
                aria-label={`Copy link to section: ${toText(children)}`}
                className="ml-1.5 inline-flex align-middle text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-600 focus:opacity-100 dark:text-neutral-600 dark:hover:text-neutral-300"
              >
                {copiedId === id ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <AnchorIcon />
                )}
              </button>
            </Tag>
          );
        },
      ]),
    ),
    a({ href, children }) {
      if (href?.startsWith('/view/') && onNavigate) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              const pathPart = decodeURIComponent(href.slice('/view/'.length).split('#')[0]);
              onNavigate(pathPart);
              const hash = href.split('#')[1];
              if (hash) document.getElementById(hash)?.scrollIntoView();
              else window.scrollTo(0, 0);
            }}
          >
            {children}
          </a>
        );
      }
      const external = EXTERNAL.test(href || '');
      return external ? (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      // eslint-disable-next-line jsx-a11y/alt-text
      return <img src={src} alt={alt || ''} loading="lazy" className="rounded-md" />;
    },
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;
      const className = child?.props?.className || '';
      const m = String(className).match(/language-(\S+)/);
      const code = String(child?.props?.children ?? '').replace(/\n$/, '');
      return <CodeBlock code={code} lang={m ? m[1] : 'plaintext'} />;
    },
  };

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:tracking-tight prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
