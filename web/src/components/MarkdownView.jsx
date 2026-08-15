import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rawUrl, viewUrl } from '../api';
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

export default function MarkdownView({ path, content, onNavigate }) {
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
